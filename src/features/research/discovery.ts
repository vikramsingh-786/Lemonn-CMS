import "server-only";
import { randomUUID } from "node:crypto";
import { sourceDomain, type NewsSource } from "@/features/dashboard/data";
import { pool } from "@/lib/pool";
import { FetchError, isWithinDomain } from "@/lib/safe-fetch";
import type { ServerEnv } from "@/lib/env";
import { draftRun } from "./draft";
import { rankRun } from "./rank";
import { addRun, claimActive, getRun, releaseActive, saveRun } from "./run-store";
import { NEWS_SITEMAPS, readNewsSitemaps, type RawItem } from "./sitemaps";
import { searchTavily } from "./tavily";
import { TOPICS, classifyTopics } from "./topics";
import { verifyRun } from "./verify";
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

/** True when the source has no sitemap, so a Tavily key is required up front. */
export function needsTavily(source: NewsSource): boolean {
  return !NEWS_SITEMAPS[source.id];
}

/** Registers a run and returns it plus the work to run in the background; null when busy. */
export function startRun(
  sources: readonly NewsSource[],
  window: ResearchRun["window"],
  env: ServerEnv,
): { runId: string; work: () => Promise<void> } | null {
  const tavilyKey = env.TAVILY_API_KEY;
  const runId = randomUUID();
  if (!claimActive(runId)) return null;
  const run: ResearchRun = {
    runId,
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
    draftQueue: [],
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
      pagesAttempted: 0,
      pagesFetched: 0,
      pagesBlocked: 0,
    },
    candidates: [],
    drafts: [],
    warnings: [],
    errorCounts: {},
    timings: [],
    shortfallReasons: [],
    error: null,
  };
  addRun(run);

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
      void saveRun(run);
      await rankRun(run, { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL_FAST });
      void saveRun(run);
      await verifyRun(run, env);
      void saveRun(run);
      await draftRun(run, env);
      completeRun(run);
    } catch {
      run.stage = "failed";
      run.error = { code: "internal_error", message: "Research failed unexpectedly." };
    } finally {
      run.currentStep = null;
      run.finishedAt = new Date().toISOString();
      releaseActive(run.runId);
      await saveRun(run);
    }
  };
  return { runId: run.runId, work };
}

function completeRun(run: ResearchRun) {
  run.stage = "completed";
  run.error = null;
  run.stageDetail =
    run.counts.processed > 0
      ? `Verified ${run.counts.verified} of ${run.counts.processed} checked stories; ${run.drafts.length} of ${run.draftQueue.length} queued stories drafted`
      : `Ranked ${run.candidates.length} candidate${run.candidates.length === 1 ? "" : "s"} from ${run.items.length} discovered stor${run.items.length === 1 ? "y" : "ies"}`;
}

export type RetryStart =
  { ok: true; work: () => Promise<void> } | { ok: false; status: 404 | 409; message: string };

/**
 * Re-verifies only the failed / not-processed stories of an existing run (same Run ID).
 * Discovery and ranking are not repeated; finished stories are left as they are.
 */
export async function startVerificationRetry(runId: string, env: ServerEnv): Promise<RetryStart> {
  const run = await getRun(runId);
  if (!run) return { ok: false, status: 404, message: "Research run not found." };
  if (run.candidates.length === 0)
    return { ok: false, status: 409, message: "This run has no ranked stories to verify." };
  if (!claimActive(runId))
    return { ok: false, status: 409, message: "A research run is already in progress." };
  run.stage = "processing";
  run.error = null;
  run.finishedAt = null;
  const work = async () => {
    try {
      await verifyRun(run, env, { retry: true });
      await draftRun(run, env); // drafts only newly queued stories
      completeRun(run);
    } catch {
      run.stage = "failed";
      run.error = { code: "internal_error", message: "Verification retry failed unexpectedly." };
    } finally {
      run.currentStep = null;
      run.finishedAt = new Date().toISOString();
      releaseActive(runId);
      await saveRun(run);
    }
  };
  return { ok: true, work };
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
      raw = await searchTavily(domain, {
        apiKey: tavilyKey,
        spendCall: () => {
          if (run.counts.searchesUsed >= MAX_TAVILY_CALLS)
            throw new FetchError(
              "budget",
              `Tavily call limit for discovery (${MAX_TAVILY_CALLS}) reached`,
            );
          run.counts.searchesUsed++;
        },
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

/**
 * (Re)drafts draft-queue stories that have no draft yet or whose drafting failed (same Run ID).
 * Discovery, ranking and verification are not repeated.
 */
export async function startDraftRetry(runId: string, env: ServerEnv): Promise<RetryStart> {
  const run = await getRun(runId);
  if (!run) return { ok: false, status: 404, message: "Research run not found." };
  const pending = run.draftQueue.filter(
    (q) => !run.drafts.some((d) => d.candidateId === q.candidateId),
  );
  if (pending.length === 0)
    return { ok: false, status: 409, message: "Every queued story already has a draft." };
  if (!claimActive(runId))
    return { ok: false, status: 409, message: "A research run is already in progress." };
  run.stage = "drafting";
  run.error = null;
  run.finishedAt = null;
  const work = async () => {
    try {
      await draftRun(run, env);
      completeRun(run);
    } catch {
      run.stage = "failed";
      run.error = { code: "internal_error", message: "Drafting failed unexpectedly." };
    } finally {
      run.currentStep = null;
      run.finishedAt = new Date().toISOString();
      releaseActive(runId);
      await saveRun(run);
    }
  };
  return { ok: true, work };
}
