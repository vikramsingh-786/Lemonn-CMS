import "server-only";
import { z } from "zod";
import { FetchError } from "@/lib/safe-fetch";
import type { RawItem } from "./sitemaps";

const ENDPOINT = "https://api.tavily.com/search";
const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 30_000;
const NEWS_QUERY =
  "Indian stock market, company results, IPO, SEBI RBI, F&O, mutual funds, economy news";

const responseSchema = z.object({
  results: z.array(
    z.object({
      url: z.string(),
      title: z.string().catch(""),
      content: z.string().catch(""),
      published_date: z.string().nullish(),
    }),
  ),
});

/** Key plus a callback run before every HTTP attempt; it throws when the run's budget is spent. */
export type TavilyAccess = { apiKey: string | undefined; spendCall: () => void };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function statusError(status: number): FetchError {
  if (status === 401) return new FetchError("auth", "Tavily rejected the API key (401)");
  if (status === 432) return new FetchError("quota", "Tavily plan limit reached (432)");
  if (status === 433) return new FetchError("quota", "Tavily usage limit reached (433)");
  if (status === 429) return new FetchError("rate_limit", "Tavily rate limit (429)");
  if (status >= 500) return new FetchError("unavailable", `Tavily unavailable (${status})`);
  return new FetchError("bad_request", `Tavily rejected the request (${status})`);
}

/** Parses a Tavily date; never invents one. */
function toIso(value: string | null | undefined): string | null {
  const ms = value ? Date.parse(value) : NaN;
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** One Tavily search with timeout and ≤2 retries on 429/timeouts/5xx (Retry-After honoured). */
async function tavilySearch(
  body: Record<string, unknown>,
  access: TavilyAccess,
): Promise<RawItem[]> {
  if (!access.apiKey) throw new FetchError("not_configured", "TAVILY_API_KEY is not set");
  for (let attempt = 0; ; attempt++) {
    access.spendCall();
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
        headers: { Authorization: `Bearer ${access.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      const timedOut = e instanceof DOMException && e.name === "TimeoutError";
      if (attempt < MAX_RETRIES) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new FetchError(
        timedOut ? "timeout" : "unavailable",
        timedOut ? "Tavily timed out" : "Tavily unreachable",
      );
    }

    if (res.ok) {
      const parsed = responseSchema.safeParse(await res.json().catch(() => null));
      if (!parsed.success)
        throw new FetchError("bad_response", "Tavily returned an unexpected response");
      return parsed.data.results.map((r) => ({
        url: r.url,
        title: r.title,
        snippet: r.content,
        publishedAt: toIso(r.published_date),
      }));
    }

    await res.body?.cancel();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) throw statusError(res.status);
    const retryAfter = Number(res.headers.get("retry-after")) * 1000;
    await sleep(Math.min(retryAfter > 0 ? retryAfter : 1000 * 2 ** attempt, MAX_RETRY_WAIT_MS));
  }
}

/** Discovery: one news search restricted to `domain` (last day, basic depth, up to 20 results). */
export function searchTavily(domain: string, access: TavilyAccess): Promise<RawItem[]> {
  return tavilySearch(
    {
      query: NEWS_QUERY,
      topic: "news",
      time_range: "day",
      search_depth: "basic",
      max_results: 20,
      include_domains: [domain],
    },
    access,
  );
}

/** Verification: general search restricted to official `domains`, optionally to recent pages. */
export function searchOfficial(
  {
    query,
    domains,
    maxResults = 5,
    timeRange,
  }: {
    query: string;
    domains: readonly string[];
    maxResults?: number;
    timeRange?: "week" | "month" | "year";
  },
  access: TavilyAccess,
): Promise<RawItem[]> {
  return tavilySearch(
    {
      query: query.slice(0, 300),
      topic: "general",
      search_depth: "basic",
      max_results: maxResults,
      include_domains: domains,
      ...(timeRange && { time_range: timeRange }),
    },
    access,
  );
}

/** Open web search, used only to find an organisation's official website. */
export function searchWeb(query: string, access: TavilyAccess, maxResults = 5): Promise<RawItem[]> {
  return tavilySearch(
    {
      query: query.slice(0, 300),
      topic: "general",
      search_depth: "basic",
      max_results: maxResults,
    },
    access,
  );
}
