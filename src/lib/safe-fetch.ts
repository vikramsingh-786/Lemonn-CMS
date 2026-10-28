import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { Readable } from "node:stream";

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;
const MB = 1024 * 1024;
const USER_AGENT = "LemonnNewsCMS/0.1 (internal news research)";

export type FetchErrorKind =
  | "timeout"
  | "rate_limit"
  | "quota"
  | "auth"
  | "unavailable"
  | "bad_response"
  | "bad_request"
  | "blocked"
  | "not_configured"
  | "budget";

/** Error whose message is safe to show to admins: no response bodies, keys or stack traces. */
export class FetchError extends Error {
  constructor(
    readonly kind: FetchErrorKind,
    message: string,
  ) {
    super(message);
  }
}

const NON_PUBLIC = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const) {
  NON_PUBLIC.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  // IPv4-mapped addresses (::ffff:a.b.c.d) are already covered by the IPv4 rules above; adding
  // ::ffff:0:0/96 here would make BlockList reject every IPv4 address.
  ["::", 127], // unspecified + loopback
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  NON_PUBLIC.addSubnet(net, prefix, "ipv6");
}

/** True when `host` is `domain` itself or one of its subdomains. */
export function isWithinDomain(host: string, domain: string): boolean {
  const h = host.toLowerCase();
  return h === domain || h.endsWith(`.${domain}`);
}

async function assertAllowed(target: string, domains: readonly string[]): Promise<URL> {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new FetchError("blocked", "invalid URL");
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.port || // only the default 443
    url.username ||
    url.password ||
    isIP(host.replace(/^\[|\]$/g, "")) ||
    !domains.some((d) => isWithinDomain(host, d))
  ) {
    throw new FetchError("blocked", "URL is outside the approved domains");
  }
  const answers = await lookup(host, { all: true }).catch(() => {
    throw new FetchError("unavailable", "DNS lookup failed");
  });
  // ponytail: DNS is checked before fetch resolves again (rebinding window); pin the IP via a
  // custom undici dispatcher if hosts ever come from less trusted config.
  if (
    answers.length === 0 ||
    answers.some((a) => NON_PUBLIC.check(a.address, a.family === 6 ? "ipv6" : "ipv4"))
  ) {
    throw new FetchError("blocked", "host resolves to a non-public address");
  }
  return url;
}

export type DocKind = "xml" | "html" | "text" | "pdf";

/** Size cap per content kind. */
const MAX_BYTES: Record<DocKind, number> = { xml: 2 * MB, html: 2 * MB, text: 2 * MB, pdf: 8 * MB };

const ACCEPT_HEADER: Record<DocKind, string> = {
  xml: "application/xml, text/xml",
  html: "text/html",
  text: "text/plain",
  pdf: "application/pdf",
};

function kindOf(contentType: string): DocKind | "octet" | null {
  const type = contentType.toLowerCase();
  if (/\bxml\b/.test(type)) return "xml";
  if (type.startsWith("text/html") || type.startsWith("application/xhtml")) return "html";
  if (type.startsWith("text/plain")) return "text";
  if (type.startsWith("application/pdf")) return "pdf";
  if (type.startsWith("application/octet-stream")) return "octet"; // some servers send PDFs so
  return null;
}

/** undici rejects responses with malformed headers (bseindia.com sends stray spaces). */
function isHttpParserError(e: unknown): boolean {
  const cause = (e as { cause?: { code?: string; message?: string } })?.cause;
  return (
    (cause?.code ?? "").startsWith("HPE_") ||
    /does not match the HTTP\/1\.1 protocol/i.test(cause?.message ?? "")
  );
}

/**
 * Same validated URL via node:https with the lenient header parser. Used ONLY after fetch failed
 * with an HTTP parser error; redirects are still returned (not followed) to the caller's loop.
 */
function lenientGet(url: URL, headers: Record<string, string>, signal: AbortSignal) {
  return new Promise<Response>((resolve, reject) => {
    const req = request(
      url,
      { method: "GET", headers, insecureHTTPParser: true, signal },
      (res) => {
        const h = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          for (const v of Array.isArray(value) ? value : value ? [value] : []) {
            try {
              h.append(key, v.trim());
            } catch {
              // drop headers that are invalid even after trimming
            }
          }
        }
        const status = res.statusCode ?? 502;
        const body =
          status === 204 || status === 304 ? null : (Readable.toWeb(res) as ReadableStream);
        resolve(new Response(body, { status, headers: h }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

export type FetchedDoc = { url: string; kind: DocKind; bytes: Uint8Array };

/**
 * The one way the server fetches third-party content: https on 443, host inside one of `domains`,
 * public DNS answers only, manual redirects (max 3, each re-validated), timeout, size cap per kind
 * (2 MB XML/HTML/text, 8 MB PDF), and only the content kinds in `accept`.
 */
export async function fetchApproved(
  target: string,
  domains: readonly string[],
  accept: readonly DocKind[],
  timeoutMs = TIMEOUT_MS,
): Promise<FetchedDoc> {
  const signal = AbortSignal.timeout(timeoutMs);
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: accept.map((k) => ACCEPT_HEADER[k]).join(", "),
  };
  try {
    for (let hop = 0; ; hop++) {
      const url = await assertAllowed(target, domains);
      let res: Response;
      try {
        res = await fetch(url, { redirect: "manual", signal, cache: "no-store", headers });
      } catch (e) {
        if (!isHttpParserError(e)) throw e;
        res = await lenientGet(url, headers, signal);
      }
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel();
        const location = res.headers.get("location");
        if (!location || hop >= MAX_REDIRECTS)
          throw new FetchError("blocked", "too many redirects");
        target = new URL(location, url).toString();
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel();
        if (res.status === 401 || res.status === 403)
          throw new FetchError("blocked", `access denied (HTTP ${res.status})`);
        if (res.status === 429) throw new FetchError("rate_limit", "rate limited (HTTP 429)");
        throw new FetchError(
          res.status >= 500 ? "unavailable" : "bad_response",
          `HTTP ${res.status}`,
        );
      }
      const declared = kindOf(res.headers.get("content-type") ?? "");
      const kind = declared === "octet" && accept.includes("pdf") ? "pdf" : declared;
      if (!kind || kind === "octet" || !accept.includes(kind)) {
        await res.body?.cancel();
        throw new FetchError("bad_response", "unsupported content type");
      }
      const bytes = await readCapped(res, MAX_BYTES[kind]);
      if (kind === "pdf" && new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
        throw new FetchError("bad_response", "not a PDF");
      }
      return { url: url.toString(), kind, bytes };
    }
  } catch (e) {
    if (e instanceof FetchError) throw e;
    throw signal.aborted
      ? new FetchError("timeout", "timed out")
      : new FetchError("unavailable", "request failed");
  }
}

/** Publisher sitemap XML from the source's own domain. */
export async function fetchSourceXml(target: string, domain: string): Promise<string> {
  const doc = await fetchApproved(target, [domain], ["xml"]);
  return new TextDecoder().decode(doc.bytes);
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (Number(res.headers.get("content-length")) > maxBytes) {
    await res.body?.cancel();
    throw new FetchError("bad_response", "response too large");
  }
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new FetchError("bad_response", "response too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
