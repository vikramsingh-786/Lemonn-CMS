import "server-only";
import type { ServerEnv } from "@/lib/env";
import { discoverStep } from "./discovery";
import { draftStep } from "./draft";
import { rankRun } from "./rank";
import type { ResearchRun } from "./types";
import { beginVerifyPass, verifyStep } from "./verify";

/**
 * Runs the next bounded piece of a research run, each short enough for one serverless request:
 * discover → rank → verify (a few stories per step) → draft (a few per step) → completed.
 * The caller saves the run after every step; a cut-off step is simply repeated.
 */
export async function runStep(run: ResearchRun, env: ServerEnv): Promise<void> {
  try {
    switch (run.stage) {
      case "discovering":
        await discoverStep(run, env);
        break;
      case "ranking":
        await rankRun(run, { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL_FAST });
        run.stage = "processing";
        break;
      case "processing":
        if (await verifyStep(run, env)) run.stage = "drafting";
        break;
      case "drafting":
        if (await draftStep(run, env)) completeRun(run);
        break;
      default:
        return; // completed or failed: nothing to do
    }
  } catch (e) {
    console.error("research step failed", run.runId, e);
    run.stage = "failed";
    run.error = { code: "internal_error", message: "Research failed unexpectedly." };
  }
  if (isFinished(run)) {
    run.currentStep = null;
    run.finishedAt ??= new Date().toISOString();
  }
}

/** Read through a call: the step above may have changed the stage TypeScript narrowed. */
function isFinished(run: ResearchRun): boolean {
  return run.stage === "completed" || run.stage === "failed" || run.stage === "cancelled";
}

function completeRun(run: ResearchRun) {
  run.stage = "completed";
  run.error = null;
  run.stageDetail =
    run.counts.processed > 0
      ? `Verified ${run.counts.verified} of ${run.counts.processed} checked stories; ${run.drafts.length} of ${run.draftQueue.length} queued stories drafted`
      : `Ranked ${run.candidates.length} candidate${run.candidates.length === 1 ? "" : "s"} from ${run.items.length} discovered stor${run.items.length === 1 ? "y" : "ies"}`;
}

/** Why a retry can't start, or null. Only finished runs are retried. */
function retryBlocked(run: ResearchRun): string | null {
  if (run.stage === "cancelled") return "This run was cancelled. Start a new research run instead.";
  if (run.stage !== "completed" && run.stage !== "failed") return "This run is still in progress.";
  return null;
}

function reopen(run: ResearchRun, stage: ResearchRun["stage"]) {
  run.stage = stage;
  run.error = null;
  run.finishedAt = null;
}

/**
 * Re-verifies only the failed / not-processed stories (same Run ID), then drafts newly queued
 * ones. Discovery and ranking are not repeated. Returns why it can't, or null.
 */
export function prepareVerificationRetry(run: ResearchRun, env: ServerEnv): string | null {
  if (run.candidates.length === 0) return "This run has no ranked stories to verify.";
  const blocked = retryBlocked(run);
  if (blocked) return blocked;
  reopen(run, "processing");
  beginVerifyPass(run, env, true);
  for (const q of run.draftQueue) delete q.draftError;
  return null;
}

/** (Re)drafts queued stories without a draft or whose drafting failed (same Run ID). */
export function prepareDraftRetry(run: ResearchRun): string | null {
  const pending = run.draftQueue.filter(
    (q) => !run.drafts.some((d) => d.candidateId === q.candidateId),
  );
  if (pending.length === 0) return "Every queued story already has a draft.";
  const blocked = retryBlocked(run);
  if (blocked) return blocked;
  reopen(run, "drafting");
  for (const q of pending) delete q.draftError;
  delete run.draftPass;
  return null;
}

/**
 * Stops an unfinished run: no further steps run, finished work (stories, verifications, drafts)
 * is kept, and a new run can start right away. A step already running finishes its current piece,
 * but its save is ignored (see saveRun). Returns why it can't, or null.
 */
export function cancelRun(run: ResearchRun): string | null {
  if (isFinished(run)) return "This run has already finished.";
  run.stage = "cancelled";
  run.currentStep = null;
  run.error = null;
  run.finishedAt = new Date().toISOString();
  run.stageDetail = "Cancelled by an editor; finished steps are kept";
  for (const c of run.candidates) {
    if (c.status === "queued" || c.status === "pending_evidence" || c.status === "verifying") {
      c.status = "not_processed";
      c.statusReason = "Not verified: the research run was cancelled.";
    }
  }
  run.counts.notProcessed = run.candidates.filter((c) => c.status === "not_processed").length;
  delete run.verifyPass;
  delete run.draftPass;
  return null;
}
