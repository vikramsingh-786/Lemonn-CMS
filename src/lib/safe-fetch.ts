import "server-only";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;
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

async function assertAllowed(target: string, domain: string): Promise<URL> {
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
    !isWithinDomain(host, domain)
  ) {
    throw new FetchError("blocked", "URL is outside the source's domain");
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

/**
 * The one way the server fetches publisher content: https on 443, host inside `domain`, public
 * DNS answers only, manual redirects (each re-validated), 10s timeout, 2 MB cap, XML only.
 */
export async function fetchSourceXml(target: string, domain: string): Promise<string> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    for (let hop = 0; ; hop++) {
      const url = await assertAllowed(target, domain);
      const res = await fetch(url, {
        redirect: "manual",
        signal,
        cache: "no-store",
        headers: { "User-Agent": USER_AGENT, Accept: "application/xml, text/xml" },
      });
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
      if (!/\bxml\b/i.test(res.headers.get("content-type") ?? "")) {
        await res.body?.cancel();
        throw new FetchError("bad_response", "response is not XML");
      }
      return await readCapped(res);
    }
  } catch (e) {
    if (e instanceof FetchError) throw e;
    throw signal.aborted
      ? new FetchError("timeout", "timed out")
      : new FetchError("unavailable", "request failed");
  }
}

async function readCapped(res: Response): Promise<string> {
  if (Number(res.headers.get("content-length")) > MAX_BYTES) {
    await res.body?.cancel();
    throw new FetchError("bad_response", "response too large");
  }
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new FetchError("bad_response", "response too large");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
