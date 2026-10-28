import "server-only";
import { randomUUID } from "node:crypto";
import { sourceDomain, type NewsSource } from "@/features/dashboard/data";
import { FetchError, isWithinDomain } from "@/lib/safe-fetch";
import { rankRun, type GeminiConfig } from "./rank";
import { NEWS_SITEMAPS, readNewsSitemaps, type RawItem } from "./sitemaps";
import { searchTavily } from "./tavily";
import { TOPICS, classifyTopics } from "./topics";
import {
  DRAFT_TARGET,
  type DiscoveredItem,
  type DiscoveryMethod,
  type ResearchRun,
  type SourceCoverage,
} from "./types";

const MAX_PER_SOURCE = 20;
const CONCURRENCY = 3;
const MAX_TAVILY_CALLS = 20;
const MAX_RUNS = 10;

// ponytail: in-memory run registry (last 10 runs, one active at a time), lost on restart.
// A database + job queue replaces it. Kept on globalThis so dev hot reloads and separate route
// bundles share one registry.
const store = ((
  globalThis as { __researchRuns?: { runs: Map<string, ResearchRun>; active: string | null } }
).__researchRuns ??= { runs: new Map(), active: null });

export function getRun(runId: string): ResearchRun | undefined {
  return store.runs.get(runId);
}

/** True when the source has no sitemap, so a Tavily key is required up front. */
export function needsTavily(source: NewsSource): boolean {
  return !NEWS_SITEMAPS[source.id];
}

/** Registers a run and returns it plus the work to run in the background; null when busy. */
export function startRun(
  sources: readonly NewsSource[],
  window: ResearchRun["window"],
  tavilyKey: string | undefined,
  gemini: GeminiConfig,
): { runId: string; work: () => Promise<void> } | null {
  if (store.active) return null;
  const run: ResearchRun = {
    runId: randomUUID(),
    window,
    stage: "discovering",
    currentStep: "discover",
    stageDetail: `Discovering news from ${sources.length} source${sources.length === 1 ? "" : "s"}`,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    draftTarget: DRAFT_TARGET,
    coverage: [],
    items: [],
    excluded: [],
    topicCounts: Object.fromEntries(TOPICS.map((t) => [t.name, 0])),
    counts: {
      resultsFound: 0,
      excludedUndated: 0,
      excludedStale: 0,
      duplicatesRemoved: 0,
      uniqueCandidates: 0,
      processed: 0,
      verified: 0,
      held: 0,
      drafts: 0,
      notProcessed: 0,
      searchesUsed: 0,
      aiCallsUsed: 0,
    },
    candidates: [],
    drafts: [],
    warnings: [],
    errorCounts: {},
    timings: [],
    shortfallReasons: [],
    error: null,
  };
  store.active = run.runId;
  store.runs.set(run.runId, run);
  for (const old of [...store.runs.keys()].slice(0, -MAX_RUNS)) store.runs.delete(old);

  const work = async () => {
    const started = Date.now();
    try {
      let done = 0;
      await pool(sources, CONCURRENCY, async (source) => {
        await discoverSource(run, source, tavilyKey);
        run.stageDetail = `Discovering: ${++done} of ${sources.length} sources done`;
      });
      run.items.sort(newestFirst);
      run.timings.push({ stage: "discovery_total", ms: Date.now() - started });
      if (run.coverage.every((c) => c.status === "failed")) {
        run.stage = "failed";
        run.error = { code: "provider_unavailable", message: "Every enabled source failed." };
        run.stageDetail = "Discovery failed for every source";
        return;
      }
      await rankRun(run, gemini);
      run.stage = "completed";
      run.stageDetail = `Ranked ${run.candidates.length} candidate${run.candidates.length === 1 ? "" : "s"} from ${run.items.length} discovered stor${run.items.length === 1 ? "y" : "ies"}`;
    } catch {
      run.stage = "failed";
      run.error = { code: "internal_error", message: "Research failed unexpectedly." };
    } finally {
      run.currentStep = null;
      run.finishedAt = new Date().toISOString();
      store.active = null;
    }
  };
  return { runId: run.runId, work };
}

async function pool<T>(items: readonly T[], size: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

function newestFirst(a: { publishedAt: string | null }, b: { publishedAt: string | null }) {
  return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
}

/** Normalised https/http link on the source's own domain, or null. Blocks javascript: etc. */
function safeItemUrl(raw: string, domain: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return isWithinDomain(url.hostname, domain) ? url.toString() : null;
  } catch {
    return null;
  }
}

function countError(run: ResearchRun, provider: string, e: unknown) {
  const kind = e instanceof FetchError ? e.kind : "unavailable";
  run.errorCounts[`${provider}:${kind}`] = (run.errorCounts[`${provider}:${kind}`] ?? 0) + 1;
}

async function discoverSource(run: ResearchRun, source: NewsSource, tavilyKey: string | undefined) {
  const started = Date.now();
  const domain = sourceDomain(source);
  const coverage: SourceCoverage = {
    sourceId: source.id,
    name: source.name,
    domain,
    status: "no_results",
    method: null,
    inWindow: 0,
    offTopic: 0,
    kept: 0,
  };

  try {
    let raw: RawItem[] | null = null;
    const sitemaps = NEWS_SITEMAPS[source.id];
    if (sitemaps) {
      coverage.method = "sitemap";
      try {
        raw = await readNewsSitemaps(sitemaps, domain);
      } catch (e) {
        countError(run, "sitemap", e);
        const reason = e instanceof FetchError ? e.message : "failed";
        run.warnings.push(`${source.name}: news sitemap ${reason}; used Tavily search instead.`);
      }
    }
    const method: DiscoveryMethod = raw ? "sitemap" : "tavily";
    coverage.method = method;
    if (!raw) {
      raw = await searchTavily(domain, tavilyKey, () => {
        if (run.counts.searchesUsed >= MAX_TAVILY_CALLS)
          throw new FetchError(
            "budget",
            `Tavily call limit for this run (${MAX_TAVILY_CALLS}) reached`,
          );
        run.counts.searchesUsed++;
      });
    }

    const start = Date.parse(run.window.start);
    const end = Date.parse(run.window.end);
    const candidates: DiscoveredItem[] = [];
    for (const item of raw) {
      const url = safeItemUrl(item.url, domain);
      if (!url || !item.title) continue;
      const t = item.publishedAt ? Date.parse(item.publishedAt) : null;
      if (t !== null && (t < start || t > end)) continue;
      coverage.inWindow++;
      const topics = classifyTopics(`${item.title}\n${item.snippet}`, url);
      if (topics.length === 0) {
        coverage.offTopic++;
        continue;
      }
      candidates.push({
        url,
        title: item.title,
        snippet: item.snippet,
        publishedAt: item.publishedAt,
        sourceId: source.id,
        publisher: source.name,
        method,
        topics,
      });
    }

    const kept = candidates.sort(newestFirst).slice(0, MAX_PER_SOURCE);
    for (const item of kept) {
      for (const topic of item.topics) run.topicCounts[topic] = (run.topicCounts[topic] ?? 0) + 1;
    }
    run.items.push(...kept);
    run.counts.resultsFound += coverage.inWindow;
    coverage.kept = kept.length;
    coverage.status = kept.length > 0 ? "ok" : "no_results";
  } catch (e) {
    countError(run, coverage.method ?? "sitemap", e);
    coverage.status = "failed";
    coverage.message = e instanceof FetchError ? e.message : "discovery failed";
  } finally {
    run.coverage.push(coverage); // only finished sources appear in coverage
    run.timings.push({ stage: source.name, ms: Date.now() - started });
  }
}
