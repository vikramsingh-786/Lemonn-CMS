/** Client-safe source rules, shared by the Add Source form and the server API. */

export const MAX_SOURCES = 10;

export type SourceUrlResult =
  { ok: true; url: string; domain: string } | { ok: false; error: string };

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Normalises an admin-entered discovery URL. Only public https hostnames are allowed.
 * These URLs are used as Tavily domain filters; the server never fetches them directly.
 */
export function normalizeSourceUrl(input: string): SourceUrlResult {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, error: "Enter a full URL, e.g. https://www.example.com/markets" };
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:") return { ok: false, error: "Only https:// URLs are allowed." };
  if (url.username || url.password)
    return { ok: false, error: "URLs with credentials are not allowed." };
  if (url.port) return { ok: false, error: "Custom ports are not allowed." };
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.includes(":") ||
    host.startsWith("[") ||
    IPV4.test(host) ||
    !/\.[a-z]{2,}$/.test(host)
  ) {
    return { ok: false, error: "Use a public website hostname (no IP addresses or local hosts)." };
  }
  url.hostname = host;
  url.hash = "";
  url.search = "";
  // Root keeps its slash ("https://site.com/"); deeper paths drop it ("https://site.com/markets").
  const normalized = url.pathname === "/" ? url.toString() : url.toString().replace(/\/$/, "");
  return { ok: true, url: normalized, domain: host.replace(/^www\./, "") };
}
