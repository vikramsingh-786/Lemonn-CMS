import "server-only";
import { z } from "zod";
import { FetchError } from "@/lib/safe-fetch";
import type { RawItem } from "./sitemaps";

const ENDPOINT = "https://api.tavily.com/search";
const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 10_000;
const QUERY =
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

/**
 * One news search restricted to `domain` (last day, basic depth, up to 20 results).
 * `spendCall` is called before every HTTP attempt and throws when the run's budget is spent.
 */
export async function searchTavily(
  domain: string,
  apiKey: string | undefined,
  spendCall: () => void,
): Promise<RawItem[]> {
  if (!apiKey) throw new FetchError("not_configured", "TAVILY_API_KEY is not set");
  for (let attempt = 0; ; attempt++) {
    spendCall();
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          query: QUERY,
          topic: "news",
          time_range: "day",
          search_depth: "basic",
          max_results: 20,
          include_domains: [domain],
        }),
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
