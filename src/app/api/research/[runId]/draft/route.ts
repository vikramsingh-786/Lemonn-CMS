import { prepareDraftRetry } from "@/features/research/pipeline";
import { requireApiSession } from "@/lib/session";
import { getRun, saveRun } from "@/features/research/run-store";
import type { ApiErrorBody, StartRunResponse } from "@/features/research/types";

/**
 * (Re)draft queued stories of an existing run that have no draft or whose drafting failed (same
 * Run ID). Discovery, ranking and verification are not repeated.
 * Prepares the run; the dashboard then drives it with POST /api/research/[runId]/step.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/research/[runId]/draft">) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const { runId } = await ctx.params;
  const run = await getRun(runId);
  const blocked = run ? prepareDraftRetry(run) : "Research run not found.";
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
