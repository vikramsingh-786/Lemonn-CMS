import "server-only";
import type { ServerEnv } from "@/lib/env";
import { pool } from "@/lib/pool";
import { FetchError } from "@/lib/safe-fetch";
import { runDraftChecks } from "./draft-checks";
import { relevantExcerpt } from "./extract";
import { draftArticle, type DraftInput, type GeminiAccess } from "./gemini";
import { loadEvidence, saveRun, type EvidencePassage } from "./run-store";
import {
  DRAFT_MIN,
  DRAFT_TARGET,
  type CandidateReport,
  type DraftQueueItem,
  type ResearchDraft,
  type ResearchRun,
} from "./types";

const CONCURRENCY = 2;
/** Per drafting pass, retries included. */
const MAX_GEMINI_CALLS = 12;
const TIME_LIMIT_MS = 4 * 60_000;
const PASSAGES_PER_CLAIM = 2;
const PASSAGE_CHARS = 1200;

const NO_EVIDENCE_TEXT = "Evidence text unavailable — re-run verification";

function warnOnce(run: ResearchRun, message: string) {
  if (!run.warnings.includes(message)) run.warnings.push(message);
}

/**
 * Step 6 on a run: an original article per draft-queue story, from verified claims and their
 * official evidence only, then deterministic checks. Stories that already have a draft are
 * skipped, so calling it again (re)drafts only missing or failed ones.
 */
export async function draftRun(run: ResearchRun, env: ServerEnv): Promise<void> {
  const todo = run.draftQueue
    .slice(0, DRAFT_TARGET)
    .filter((q) => !run.drafts.some((d) => d.candidateId === q.candidateId));
  if (!env.GEMINI_API_KEY) {
    if (todo.length > 0) warnOnce(run, "Drafting skipped: GEMINI_API_KEY not set.");
    updateShortfall(run);
    return;
  }
  if (todo.length === 0) {
    updateShortfall(run);
    return;
  }

  const started = Date.now();
  run.stage = "drafting";
  run.currentStep = "draft";
  const limit = run.counts.aiCallsUsed + MAX_GEMINI_CALLS;
  const access: GeminiAccess = {
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL_REASONING,
    spendCall: () => {
      if (run.counts.aiCallsUsed >= limit)
        throw new FetchError(
          "budget",
          `Gemini call limit for drafting (${MAX_GEMINI_CALLS}) reached`,
        );
      run.counts.aiCallsUsed++;
    },
  };
  const passages = await loadEvidence(run.runId);
  let stopReason: string | null = null;
  let begun = 0;

  await pool(todo, CONCURRENCY, async (q) => {
    if (!stopReason && Date.now() - started > TIME_LIMIT_MS)
      stopReason = "Drafting time limit (4 min) reached";
    if (stopReason) {
      q.draftError = `Not drafted: ${stopReason}.`;
      return;
    }
    const c = run.candidates.find((x) => x.id === q.candidateId);
    if (!c) return;
    run.stageDetail = `Drafting ${++begun} of ${todo.length}`;
    try {
      const draft = await draftOne(q, c, passages, access);
      if (typeof draft === "string") {
        q.draftError = draft;
      } else {
        run.drafts = [...run.drafts.filter((d) => d.candidateId !== c.id), draft];
        c.draftId = draft.id;
        delete q.draftError;
      }
    } catch (e) {
      if (e instanceof FetchError && e.kind === "budget") {
        stopReason = e.message;
        q.draftError = `Not drafted: ${e.message}.`;
      } else {
        const key = `gemini:${e instanceof FetchError ? e.kind : "unavailable"}`;
        run.errorCounts[key] = (run.errorCounts[key] ?? 0) + 1;
        q.draftError = `Draft generation failed: ${e instanceof FetchError ? e.message : "unexpected error"}.`;
      }
    }
    run.counts.drafts = run.drafts.length;
    void saveRun(run);
  });

  // Keep drafts in queue order.
  const order = new Map(run.draftQueue.map((q, i) => [q.candidateId, i]));
  run.drafts.sort((a, b) => (order.get(a.candidateId) ?? 99) - (order.get(b.candidateId) ?? 99));
  run.counts.drafts = run.drafts.length;
  updateShortfall(run);
  run.timings.push({ stage: "draft", ms: Date.now() - started });
}

/** Why fewer than DRAFT_TARGET drafts exist. */
function updateShortfall(run: ResearchRun) {
  const reasons: string[] = [];
  if (run.drafts.length >= DRAFT_TARGET) {
    run.shortfallReasons = [];
    return;
  }
  if (run.draftQueue.length < DRAFT_TARGET) {
    const filled = run.draftQueue.filter((q) =>
      q.reason.startsWith("Below the evidence bar"),
    ).length;
    const met = run.draftQueue.length - filled;
    reasons.push(
      `Only ${met} ${met === 1 ? "story" : "stories"} met the evidence bar for drafting (verified, or every high-materiality claim verified).`,
    );
    if (filled > 0)
      reasons.push(
        `${filled} more ${filled === 1 ? "story was" : "stories were"} added to reach ${DRAFT_MIN}, drafted from verified claims only (needs recheck).`,
      );
    if (run.draftQueue.length < DRAFT_MIN)
      reasons.push(
        `Fewer than ${DRAFT_MIN} checked stories had any verified claim, so no more could be drafted without unverified facts.`,
      );
  }
  const failed = run.draftQueue.filter((q) => q.draftError);
  if (failed.length > 0) {
    reasons.push(
      `${failed.length} queued ${failed.length === 1 ? "story was" : "stories were"} not drafted: ${[...new Set(failed.map((q) => q.draftError))].join(" ")}`,
    );
  }
  if (
    run.draftQueue.length > 0 &&
    !run.drafts.length &&
    !failed.length &&
    run.warnings.some((w) => w.startsWith("Drafting skipped"))
  ) {
    reasons.push("Drafting skipped: GEMINI_API_KEY not set.");
  }
  run.shortfallReasons = reasons;
}

/** Drafts one story; returns a skip reason string instead of a draft when it can't be drafted. */
async function draftOne(
  q: DraftQueueItem,
  c: CandidateReport,
  passages: Record<string, EvidencePassage>,
  access: GeminiAccess,
): Promise<ResearchDraft | string> {
  const verified = c.claims.filter((a) => a.status === "verified");
  if (verified.length === 0) return "Not drafted: the story has no verified claims.";
  const evidence = new Map(c.evidence.map((e) => [e.id, e]));

  const claims = verified.map((a, i) => {
    const supporting = a.links
      .filter((l) => l.relation === "supports")
      .map((l) => evidence.get(l.evidenceId))
      .filter((e) => e !== undefined);
    const official = supporting.filter((e) => e.kind === "primary" && e.retrieval === "page");
    const texts = official
      .filter((e) => passages[e.id])
      .slice(0, PASSAGES_PER_CLAIM)
      .map((e) => ({
        organisation: e.organisation,
        url: e.url,
        passage: relevantExcerpt(
          passages[e.id]!.text,
          [{ text: a.claim, figures: a.figures }],
          PASSAGE_CHARS,
        ),
      }));
    return {
      kId: `K${i + 1}`,
      assessment: a,
      official,
      secondary: supporting.filter((e) => e.kind === "secondary"),
      texts,
    };
  });
  if (claims.every((k) => k.texts.length === 0)) return `Not drafted: ${NO_EVIDENCE_TEXT}.`;

  const unconfirmed = [
    ...c.claims
      .filter((a) => a.materiality !== "low" && a.status !== "verified")
      .map((a) => a.claim),
    ...verified.map((a) => a.gaps.trim()).filter(Boolean),
  ];
  const input: DraftInput = {
    verifiedClaims: claims.map((k) => ({
      id: k.kId,
      claim: k.assessment.claim,
      authority: k.assessment.authority,
      figures: k.assessment.figures,
      evidence: k.texts,
    })),
    unconfirmed,
    originalReport: { publisher: c.publisher, url: c.url, publishedAt: c.publishedAt },
  };

  const out = await draftArticle(input, access);
  const passagesText = claims.flatMap((k) => k.texts.map((t) => t.passage));
  const checks = runDraftChecks(out, {
    allowedText: [
      ...claims.flatMap((k) => [k.assessment.claim, ...k.assessment.figures]),
      ...passagesText,
    ].join("\n"),
    givenIds: claims.map((k) => k.kId),
    copySources: [...passagesText, c.headline, ...c.otherReports.map((r) => r.title)],
  });
  const used = claims.filter((k) => out.claimIdsUsed.includes(k.kId));
  const failed = checks.filter((x) => !x.passed);
  const ready = q.readiness === "ready_for_review" && failed.length === 0;
  const uniq = (xs: string[]) => [...new Set(xs)];

  return {
    id: `d-${c.id}`,
    candidateId: c.id,
    headline: out.headline,
    summary: out.summary,
    body: out.body,
    seoTitle: out.seoTitle,
    seoDescription: out.seoDescription,
    originalUrl: c.url,
    publisher: c.publisher,
    sourcePublishedAt: c.publishedAt,
    // Only URLs from our own evidence records, never model output.
    officialEvidenceUrls: uniq(used.flatMap((k) => k.official.map((e) => e.url))),
    secondaryEvidenceUrls: uniq(used.flatMap((k) => k.secondary.map((e) => e.url))),
    verificationStatus: c.status === "verified" ? "verified" : "partially_verified",
    category: out.category,
    tags: out.tags,
    claimEvidence: used.map((k) => ({
      claim: k.assessment.claim,
      evidenceUrls: uniq(k.official.map((e) => e.url)),
    })),
    missingEvidenceWarnings: unconfirmed,
    checks,
    readiness: ready ? "ready_for_review" : "needs_recheck",
    readinessReason: ready
      ? "Every check passed and every material claim is verified. Still needs human review before publishing."
      : [
          q.readiness !== "ready_for_review" && "Some supporting claims are not verified.",
          ...failed.map((x) => `${x.check.replace("_", " ")}: ${x.note}`),
        ]
          .filter(Boolean)
          .join(" "),
    model: access.model,
    createdAt: new Date().toISOString(),
    researchedAt: new Date().toISOString(),
  };
}
