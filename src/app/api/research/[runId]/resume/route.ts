import { prepareResume, ownerBlock } from "@/features/research/pipeline";
import { requireApi } from "@/lib/auth";
import { getRun, saveReopenedRun, withRunLock } from "@/features/research/run-store";
import type { ApiErrorBody, StartRunResponse } from "@/features/research/types";
import { serverEnv } from "@/lib/env";

const NO_STORE = { "Cache-Control": "no-store" };

function fail(
  status: number,
  code: ApiErrorBody["error"]["code"],
  message: string,
  retryable = false,
) {
  const body: ApiErrorBody = { error: { code, message, retryable } };
  return Response.json(body, { status, headers: NO_STORE });
}

/**
 * Resumes a stopped, cancelled or failed run where it stopped (see prepareResume). Prepares the
 * run; the page that resumed it then drives it with POST /api/research/[runId]/step.
 * Takes the run's lock first: a step that is still finishing must end before the run reopens, or
 * its late save would overwrite the resumed run.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/research/[runId]/resume">) {
  const auth = await requireApi("research:run");
  if (auth.denied) return auth.denied;
  const { runId } = await ctx.params;
  const owned = await getRun(runId);
  if (!owned) return fail(404, "not_found", "Research run not found.");
  const denied = ownerBlock(owned, auth.user, "resume");
  if (denied) return fail(403, "forbidden", denied);
  // Refused without touching the run (no lock) when it can't be resumed anyway.
  const early = prepareResume(structuredClone(owned), serverEnv(), auth.user.name);
  if (early) return fail(409, "busy", early);
  const result = await withRunLock(runId, async (lock) => {
    const run = await getRun(runId, { stopAbandoned: true });
    if (!run) return fail(404, "not_found", "Research run not found.");
    const blocked = prepareResume(run, serverEnv(), auth.user.name);
    if (blocked) return fail(409, "busy", blocked);
    const saved = await saveReopenedRun(run, lock);
    if (saved === "busy") return fail(409, "busy", "Another research run is going. Stop it first.");
    if (saved === "stale") return fail(409, "busy", "This run was already resumed.");
    const body: StartRunResponse = { runId };
    return Response.json(body, { status: 202, headers: NO_STORE });
  });
  return (
    result ??
    fail(409, "busy", "A step of this run is still finishing; try again in a moment.", true)
  );
}
