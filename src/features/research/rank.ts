import "server-only";
import { FetchError } from "@/lib/safe-fetch";
import { SCREEN_BATCH_SIZE, screenBatch, type ScreenVerdict } from "./gemini";
import { RANK_CONFIG as C } from "./rank-config";
import type { CandidateReport, DiscoveredItem, ExcludedItem, ResearchRun } from "./types";

type DatedItem = DiscoveredItem & { publishedAt: string; canonical: string };

/** A duplicate cluster: lead report first. */
export type Cluster = { lead: DatedItem; others: DatedItem[]; words: Set<string>[] };

/** Rules-ranked candidate before (optional) Gemini screening. */
export type RankedCandidate = { candidate: CandidateReport; snippet: string };

/** Lowercase host without www, no fragment/tracking params/trailing slash. Duplicate key only. */
export function canonicalUrl(raw: string): string {
  const url = new URL(raw);
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || C.trackingParams.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString().replace(/\/$/, "");
}

/** Meaningful lower-cased headline words; "1,219" and "1219" compare equal, "₹"/"rs" ignored. */
function headlineWords(title: string): Set<string> {
  const words = title
    .toLowerCase()
    .replace(/(\d),(?=\d)/g, "$1")
    .match(/[\p{L}\p{N}]+(?:\.\d+)?/gu);
  return new Set((words ?? []).filter((w) => w.length > 1 && w !== "rs" && !C.stopWords.has(w)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

function sourcePoints(sourceId: string): number {
  if ((C.exchangeSourceIds as readonly string[]).includes(sourceId)) return C.exchangePoints;
  if ((C.majorSourceIds as readonly string[]).includes(sourceId)) return C.majorPoints;
  return C.otherPoints;
}

function exclude(
  item: DiscoveredItem,
  reason: ExcludedItem["reason"],
  detail: string,
): ExcludedItem {
  return { url: item.url, title: item.title, publisher: item.publisher, reason, detail };
}

/** Step 4a: normalise, drop undated/out-of-window/non-article items, merge duplicates. */
export function clean(items: readonly DiscoveredItem[], window: ResearchRun["window"]) {
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  const excluded: ExcludedItem[] = [];
  const kept: DatedItem[] = [];

  for (const raw of items) {
    const item = { ...raw, title: raw.title.replace(/\s+/g, " ").trim() };
    if (!item.publishedAt) {
      excluded.push(exclude(item, "timestamp_unverified", "No publication time from the source"));
      continue;
    }
    const t = Date.parse(item.publishedAt);
    if (Number.isNaN(t)) {
      excluded.push(exclude(item, "timestamp_unverified", "Unreadable publication time"));
      continue;
    }
    if (t > end + C.futureToleranceMs) {
      excluded.push(exclude(item, "future_dated", `Dated ${item.publishedAt}, after the run`));
      continue;
    }
    if (t < start || t > end) {
      excluded.push(exclude(item, "out_of_window", "Published outside the last 24 hours"));
      continue;
    }
    const path = new URL(item.url).pathname;
    if (C.nonArticle.path.test(path) || C.nonArticle.title.test(item.title)) {
      excluded.push(exclude(item, "not_an_article", "File, live price or company profile page"));
      continue;
    }
    kept.push({
      ...item,
      publishedAt: new Date(t).toISOString(),
      canonical: canonicalUrl(item.url),
    });
  }

  // Most credible first, then earliest: the first item of each cluster becomes its lead.
  kept.sort(
    (a, b) =>
      sourcePoints(b.sourceId) - sourcePoints(a.sourceId) ||
      a.publishedAt.localeCompare(b.publishedAt),
  );
  // ponytail: O(n²) headline comparison; fine for ≤200 items per run, use MinHash if runs grow.
  const clusters: Cluster[] = [];
  let duplicatesRemoved = 0;
  for (const item of kept) {
    const words = headlineWords(item.title);
    const t = Date.parse(item.publishedAt);
    const match = clusters.find((c) =>
      [c.lead, ...c.others].some(
        (member, i) =>
          member.canonical === item.canonical ||
          (Math.abs(Date.parse(member.publishedAt) - t) <= C.duplicateWindowMs &&
            jaccard(c.words[i]!, words) >= C.duplicateJaccard),
      ),
    );
    if (match) {
      duplicatesRemoved++;
      // Same URL found twice (e.g. sitemap + Tavily) adds nothing new.
      if (![match.lead, ...match.others].some((m) => m.canonical === item.canonical)) {
        match.others.push(item);
        match.words.push(words);
      }
    } else {
      clusters.push({ lead: item, others: [], words: [words] });
    }
  }
  return { clusters, excluded, duplicatesRemoved };
}

/** Step 4b: deterministic rule score with a reason per contribution. */
function scoreCluster(cluster: Cluster, windowEnd: number): { score: number; reasons: string[] } {
  const { lead } = cluster;
  const reasons: string[] = [];
  let score = 0;
  const add = (points: number, reason: string) => {
    if (points === 0) return;
    score += points;
    reasons.push(reason.replace("{p}", points > 0 ? `+${points}` : `−${-points}`));
  };

  const ageHours = (windowEnd - Date.parse(lead.publishedAt)) / 3_600_000;
  const recency = C.recency.find(([maxHours]) => ageHours <= maxHours);
  if (recency) add(recency[1], `recency {p} (${Math.max(0, Math.round(ageHours))}h old)`);

  const publishers = new Set([lead, ...cluster.others].map((i) => i.publisher)).size;
  add(
    Math.min(C.coverageMax, (publishers - 1) * C.coveragePerPublisher),
    `${publishers} publishers {p}`,
  );

  const src = sourcePoints(lead.sourceId);
  add(
    src,
    `source {p} (${src === C.exchangePoints ? "exchange" : src === C.majorPoints ? "major publisher" : "other"})`,
  );

  const topics = clusterTopics(cluster);
  const best = Math.max(0, ...topics.map((t) => C.topicPoints[t] ?? 0));
  const bestTopic = topics.find((t) => (C.topicPoints[t] ?? 0) === best);
  if (bestTopic) add(best, `topic {p} (${bestTopic})`);

  if (C.announcement.pattern.test(lead.title)) add(C.announcement.points, "announcement {p}");

  const path = new URL(lead.url).pathname;
  for (const noise of C.noise) {
    const hit = noise.pattern.test(lead.title) || ("path" in noise && noise.path.test(path));
    if (hit) add(noise.points, `${noise.label} {p}`);
  }
  return { score, reasons };
}

function clusterTopics(cluster: Cluster): string[] {
  return [...new Set([cluster.lead, ...cluster.others].flatMap((i) => i.topics))];
}

/** Ranked order: highest score first, ties → newer first. */
export function byRank(a: CandidateReport, b: CandidateReport): number {
  return b.score - a.score || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
}

/** Builds rules-only candidates (unranked numbering) from cleaned clusters. */
export function scoreClusters(
  clusters: readonly Cluster[],
  window: ResearchRun["window"],
): RankedCandidate[] {
  const end = Date.parse(window.end);
  return clusters.map((cluster, i) => {
    const { lead, others } = cluster;
    const { score, reasons } = scoreCluster(cluster, end);
    return {
      snippet: lead.snippet,
      candidate: {
        id: `c${i + 1}`,
        rank: 0,
        headline: lead.title,
        url: lead.url,
        publisher: lead.publisher,
        publishedAt: lead.publishedAt,
        otherReports: others.map((o) => ({
          url: o.url,
          title: o.title,
          publisher: o.publisher,
          publishedAt: o.publishedAt,
        })),
        status: "queued",
        statusReason: "Queued for claim verification (Step 5, not built yet).",
        primaryEvidenceFound: false,
        claims: [],
        claimCounts: { supported: 0, partially_supported: 0, contradicted: 0, unresolved: 0 },
        evidence: [],
        evidenceSearchFailures: 0,
        draftId: null,
        score,
        rankReasons: reasons,
        topics: clusterTopics(cluster),
        screenedBy: "rules",
      },
    };
  });
}

export type GeminiConfig = { apiKey: string | undefined; model: string };

const MAX_GEMINI_CALLS = 6;

/** Step 4 on a run: clean → rules score → Gemini screen (if available) → ranked candidates. */
export async function rankRun(run: ResearchRun, gemini: GeminiConfig): Promise<void> {
  run.stage = "ranking";
  run.currentStep = "rank";
  run.stageDetail = "Cleaning and de-duplicating stories";
  const cleanStarted = Date.now();
  const { clusters, excluded, duplicatesRemoved } = clean(run.items, run.window);
  run.excluded.push(...excluded);
  run.counts.excludedUndated = excluded.filter((e) => e.reason === "timestamp_unverified").length;
  run.counts.excludedStale = excluded.filter(
    (e) => e.reason === "out_of_window" || e.reason === "future_dated",
  ).length;
  run.counts.duplicatesRemoved = duplicatesRemoved;
  run.timings.push({ stage: "clean", ms: Date.now() - cleanStarted });

  const rankStarted = Date.now();
  let ranked = scoreClusters(clusters, run.window);

  if (!gemini.apiKey) {
    run.warnings.push(
      "AI relevance screen unavailable (GEMINI_API_KEY not set); ranked with rules only.",
    );
  } else if (ranked.length > 0) {
    run.stageDetail = `Screening ${ranked.length} candidates with Gemini`;
    const verdicts = new Map<string, ScreenVerdict>();
    const batches: RankedCandidate[][] = [];
    for (let i = 0; i < ranked.length; i += SCREEN_BATCH_SIZE) {
      batches.push(ranked.slice(i, i + SCREEN_BATCH_SIZE));
    }
    let failed = 0;
    const errors = new Set<string>();
    for (const batch of batches) {
      try {
        const results = await screenBatch(
          batch.map(({ candidate, snippet }) => ({
            id: candidate.id,
            headline: candidate.headline,
            publisher: candidate.publisher,
            snippet,
            topics: candidate.topics,
          })),
          gemini.apiKey,
          gemini.model,
          () => {
            if (run.counts.aiCallsUsed >= MAX_GEMINI_CALLS)
              throw new FetchError(
                "budget",
                `Gemini call limit for this run (${MAX_GEMINI_CALLS}) reached`,
              );
            run.counts.aiCallsUsed++;
          },
        );
        const ids = new Set(batch.map((b) => b.candidate.id));
        for (const v of results) if (ids.has(v.id)) verdicts.set(v.id, v); // unknown ids ignored
      } catch (e) {
        failed++;
        const kind = e instanceof FetchError ? e.kind : "unavailable";
        run.errorCounts[`gemini:${kind}`] = (run.errorCounts[`gemini:${kind}`] ?? 0) + 1;
        errors.add(e instanceof FetchError ? e.message : "Gemini request failed");
      }
    }
    if (failed === batches.length) {
      run.warnings.push(
        `AI relevance screen unavailable (${[...errors].join("; ")}); ranked with rules only.`,
      );
    } else if (failed > 0) {
      run.warnings.push(
        `${failed} of ${batches.length} screening batches failed (${[...errors].join("; ")}); those candidates are ranked with rules only.`,
      );
    }

    const g = C.gemini;
    ranked = ranked.filter(({ candidate: c }) => {
      const v = verdicts.get(c.id);
      if (!v) return true;
      if (!v.relevant || !v.newsworthy) {
        run.excluded.push({
          url: c.url,
          title: c.headline,
          publisher: c.publisher,
          reason: "irrelevant",
          detail: `Gemini: ${v.reason}`,
        });
        return false;
      }
      c.score += g.impact[v.impact] + (v.verifiable ? g.verifiable : 0);
      c.rankReasons.push(`Gemini impact ${v.impact} +${g.impact[v.impact]}`);
      if (v.verifiable) c.rankReasons.push(`Gemini verifiable +${g.verifiable}`);
      c.rankReasons.push(`Gemini: ${v.reason}`);
      c.screenedBy = "rules+gemini";
      return true;
    });
  }

  run.candidates = ranked.map((r) => r.candidate).sort(byRank);
  run.candidates.forEach((c, i) => (c.rank = i + 1));
  run.counts.uniqueCandidates = run.candidates.length;
  run.timings.push({ stage: "rank", ms: Date.now() - rankStarted });
}
