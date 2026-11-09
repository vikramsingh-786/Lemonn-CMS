import { prepareVerificationRetry, ownerBlock } from "@/features/research/pipeline";
import { requireApi } from "@/lib/auth";
import { getRun, saveRun, withRunLock } from "@/features/research/run-store";
import type { ApiErrorBody, StartRunResponse } from "@/features/research/types";
import { serverEnv } from "@/lib/env";

function fail(
  status: number,
  code: ApiErrorBody["error"]["code"],
  message: string,
  retryable = false,
) {
  const body: ApiErrorBody = { error: { code, message, retryable } };
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Retry verification for an existing run (same Run ID): only failed / not-processed stories are
 * verified again, then newly queued stories are drafted. Discovery and ranking are not repeated.
 * Prepares the run under its lock; the dashboard then drives it with POST /api/research/[runId]/step.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/research/[runId]/verify">) {
  const auth = await requireApi("research:run");
  if (auth.denied) return auth.denied;
  const { runId } = await ctx.params;
  const owned = await getRun(runId);
  if (!owned) return fail(404, "not_found", "Research run not found.");
  const denied = ownerBlock(owned, auth.user, "retry");
  if (denied) return fail(403, "forbidden", denied);
  // Refused without touching the run (no lock) when there is nothing to retry.
  const early = prepareVerificationRetry(structuredClone(owned), serverEnv());
  if (early) return fail(409, "busy", early);
  const result = await withRunLock(runId, async () => {
    const run = await getRun(runId, { stopAbandoned: true });
    if (!run) return fail(404, "not_found", "Research run not found.");
    const blocked = prepareVerificationRetry(run, serverEnv());
    if (blocked) return fail(409, "busy", blocked);
    if (!(await saveRun(run))) return fail(409, "busy", "This run changed meanwhile; reload it.");
    const body: StartRunResponse = { runId };
    return Response.json(body, { status: 202, headers: { "Cache-Control": "no-store" } });
  });
  return result ?? fail(409, "busy", "This run is being worked on; try again shortly.", true);
}
