import { prepareVerificationRetry } from "@/features/research/pipeline";
import { getRun, saveRun } from "@/features/research/run-store";
import type { ApiErrorBody, StartRunResponse } from "@/features/research/types";
import { serverEnv } from "@/lib/env";

/**
 * Retry verification for an existing run (same Run ID): only failed / not-processed stories are
 * verified again, then newly queued stories are drafted. Discovery and ranking are not repeated.
 * Prepares the run; the dashboard then drives it with POST /api/research/[runId]/step.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/research/[runId]/verify">) {
  const { runId } = await ctx.params;
  const run = await getRun(runId);
  const blocked = run ? prepareVerificationRetry(run, serverEnv()) : "Research run not found.";
  if (!run || blocked) {
    const body: ApiErrorBody = {
      error: { code: run ? "busy" : "not_found", message: blocked!, retryable: false },
    };
    return Response.json(body, {
      status: run ? 409 : 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  await saveRun(run);
  const body: StartRunResponse = { runId };
  return Response.json(body, { status: 202, headers: { "Cache-Control": "no-store" } });
}
