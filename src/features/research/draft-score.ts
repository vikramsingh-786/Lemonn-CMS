import type { CandidateReport, DraftQueueItem } from "./types";

/**
 * Verification score: how strongly official evidence backs a story's claims. It decides which
 * verified stories are drafted first (at most DRAFT_TARGET). Weights live here to be tuned.
 */
export const SCORE = {
  verified: { high: 10, medium: 6 },
  partially_verified: { high: 3, medium: 2 },
  /** Each distinct official page/PDF that supports a claim (not snippets, not stale). */
  officialPage: 2,
  officialPageMax: 6,
  /** Each independent publisher after merging copies of the same report. */
  independent: 1,
  independentMax: 3,
  staleEvidence: -2,
} as const;

export function verificationScore(c: CandidateReport): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const add = (points: number, reason: string) => {
    if (points === 0) return;
    score += points;
    reasons.push(`${reason} ${points > 0 ? "+" : "−"}${Math.abs(points)}`);
  };

  for (const a of c.claims) {
    if (a.materiality === "low") continue;
    if (a.status === "verified" || a.status === "partially_verified") {
      add(SCORE[a.status][a.materiality], `${a.materiality} claim ${a.status.replace("_", " ")}`);
    }
  }

  const evidence = new Map(c.evidence.map((e) => [e.id, e]));
  const supportingPages = new Set(
    c.claims.flatMap((a) =>
      a.links
        .filter((l) => l.relation === "supports")
        .map((l) => evidence.get(l.evidenceId))
        .filter((e) => e && e.kind === "primary" && e.retrieval === "page" && !e.stale)
        .map((e) => e!.url),
    ),
  );
  add(
    Math.min(SCORE.officialPageMax, supportingPages.size * SCORE.officialPage),
    `${supportingPages.size} official page(s)`,
  );
  add(
    Math.min(SCORE.independentMax, c.independentSources * SCORE.independent),
    `${c.independentSources} independent publisher(s)`,
  );
  if (c.evidence.some((e) => e.stale)) add(SCORE.staleEvidence, "stale official source");
  return { score, reasons };
}

/**
 * Draft queue: eligible stories by verification score (ties → better rank), at most `target`.
 * Eligible: `verified` (ready for review), or `partially_verified` when every HIGH-materiality
 * claim is verified (needs an evidence recheck by the editor). Conflicting stories never qualify.
 */
export function buildDraftQueue(
  candidates: readonly CandidateReport[],
  target: number,
): DraftQueueItem[] {
  return candidates
    .flatMap((c): DraftQueueItem[] => {
      if (c.verificationScore === null) return [];
      const high = c.claims.filter((a) => a.materiality === "high");
      const highVerified = high.length > 0 && high.every((a) => a.status === "verified");
      if (c.status === "verified") {
        return [item(c, "ready_for_review", "All material claims verified by official sources.")];
      }
      if (c.status === "partially_verified" && highVerified) {
        return [
          item(
            c,
            "needs_recheck",
            "Every high-materiality claim verified; some supporting claims are not.",
          ),
        ];
      }
      return [];
    })
    .sort((a, b) => b.verificationScore - a.verificationScore || a.rank - b.rank)
    .slice(0, target);
}

function item(
  c: CandidateReport,
  readiness: DraftQueueItem["readiness"],
  reason: string,
): DraftQueueItem {
  return {
    candidateId: c.id,
    rank: c.rank,
    headline: c.headline,
    verificationScore: c.verificationScore ?? 0,
    readiness,
    reason,
  };
}
