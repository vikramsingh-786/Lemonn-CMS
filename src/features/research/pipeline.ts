import "server-only";
import type { ServerEnv } from "@/lib/env";
import { discoverStep } from "./discovery";
import { draftStep } from "./draft";
import { rankRun } from "./rank";
import { stopRun } from "./run-store";
import type { ResearchRun } from "./types";
import { mayManageRun, type SessionUser } from "@/lib/roles";
import { beginVerifyPass, queueStory, verifyStep } from "./verify";

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

/**
 * Verifies one chosen story of a finished run (same Run ID), then drafts it if it qualifies for
 * the draft queue. Returns why it can't, or null.
 */
export function prepareStoryVerification(
  run: ResearchRun,
  candidateId: string,
  by: string,
): string | null {
  const blocked = retryBlocked(run);
  if (blocked) return blocked;
  const notQueued = queueStory(run, candidateId);
  if (notQueued) return notQueued;
  run.error = null;
  run.finishedAt = null;
  run.stageDetail = `Verifying one story chosen by ${by}`;
  for (const q of run.draftQueue) delete q.draftError;
  delete run.draftPass;
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
export function cancelRun(run: ResearchRun, by?: string): string | null {
  if (isFinished(run)) return "This run has already finished.";
  stopRun(run, `Cancelled${by ? ` by ${by}` : ""}; finished steps are kept`);
  return null;
}

/**
 * Why `user` may not act on `run`, or null. A run belongs to the account that started it: only
 * that account (or an admin) continues, retries, resumes or cancels it. Runs from before
 * accounts have no owner.
 */
export function ownerBlock(
  run: ResearchRun,
  user: SessionUser,
  action: "continue" | "retry" | "resume" | "cancel",
): string | null {
  if (mayManageRun(run.startedById, user)) return null;
  return `Only ${run.startedBy ?? "the person who started it"} can ${action} this research run.`;
}

/**
 * Restarts a stopped, cancelled or failed run where it stopped (same Run ID and window):
 * discovery again if it found nothing yet, ranking if nothing was ranked, otherwise verification
 * of the stories not verified yet, then drafting. Returns why it can't, or null.
 */
export function prepareResume(run: ResearchRun, env: ServerEnv, by: string): string | null {
  if (run.stage !== "cancelled" && run.stage !== "failed")
    return run.stage === "completed"
      ? "This run is complete; use its retry buttons instead."
      : "This run is still in progress.";
  reopen(run, "processing");
  if (run.candidates.length > 0) {
    beginVerifyPass(run, env, true);
    for (const q of run.draftQueue) delete q.draftError;
    delete run.draftPass;
  } else if (run.items.length > 0) {
    run.stage = "ranking";
    run.currentStep = "rank";
  } else {
    run.stage = "discovering";
    run.currentStep = "discover";
    run.coverage = [];
    run.topicCounts = {};
  }
  run.stageDetail = `Resumed by ${by}`;
  return null;
}
