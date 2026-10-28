import "server-only";
import { fetchSourceXml } from "@/lib/safe-fetch";

/** A story as read from a sitemap or Tavily, before topic filtering. */
export type RawItem = { url: string; title: string; snippet: string; publishedAt: string | null };

/**
 * Google News sitemaps per source id (checked against the live sites on 28 Oct 2026; each is
 * listed in the site's robots.txt). Server-only config, never sent to the browser.
 */
export const NEWS_SITEMAPS: Readonly<Record<string, readonly string[]>> = {
  moneycontrol: ["https://www.moneycontrol.com/news/news-sitemap.xml"],
  "et-markets": [
    "https://economictimes.indiatimes.com/etstatic/sitemaps/et/news/sitemap-today.xml",
    "https://economictimes.indiatimes.com/etstatic/sitemaps/et/news/sitemap-yesterday.xml",
  ],
  "bs-markets": ["https://www.business-standard.com/sitemap/news-sitemap.xml"],
  cnbctv18: ["https://www.cnbctv18.com/commonfeeds/v1/cne/sitemap/google-news.xml"],
  "mint-markets": [
    "https://www.livemint.com/sitemap/today.xml",
    "https://www.livemint.com/sitemap/yesterday.xml",
  ],
  "bloomberg-markets": ["https://www.bloomberg.com/sitemaps/news/latest.xml"],
  // Not today.xml/yesterday.xml: those have no publication dates.
  "fe-markets": ["https://www.financialexpress.com/news-sitemap.xml"],
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  reg: "®",
  copy: "©",
  trade: "™",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rupee: "₹",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
    if (name[0] === "#") {
      const code =
        name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[name.toLowerCase()] ?? match;
  });
}

function tagText(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!m) return "";
  const raw = m[1]!.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
  // Some publishers double-encode (&amp;amp;), so decode twice. Output is rendered as plain text.
  return decodeEntities(decodeEntities(raw)).replace(/\s+/g, " ").trim();
}

/** Parses the flat Google News sitemap format. Entries without a usable date are skipped. */
export function parseNewsSitemap(xml: string): RawItem[] {
  const items: RawItem[] = [];
  for (const [, block] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const url = tagText(block!, "loc");
    const title = tagText(block!, "news:title");
    const date = Date.parse(tagText(block!, "news:publication_date"));
    if (!url || !title || Number.isNaN(date)) continue;
    items.push({
      url,
      title,
      snippet: tagText(block!, "news:keywords"),
      publishedAt: new Date(date).toISOString(),
    });
  }
  return items;
}

/** Fetches and merges a source's sitemaps (same URL kept once). Throws FetchError on any failure. */
export async function readNewsSitemaps(
  urls: readonly string[],
  domain: string,
): Promise<RawItem[]> {
  const byUrl = new Map<string, RawItem>();
  for (const url of urls) {
    for (const item of parseNewsSitemap(await fetchSourceXml(url, domain))) {
      if (!byUrl.has(item.url)) byUrl.set(item.url, item);
    }
  }
  return [...byUrl.values()];
}
