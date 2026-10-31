import { prepareResume, ownerBlock } from "@/features/research/pipeline";
import { requireApi } from "@/lib/auth";
import { activeRunId, getRun, saveReopenedRun } from "@/features/research/run-store";
import type { ApiErrorBody, StartRunResponse } from "@/features/research/types";
import { serverEnv } from "@/lib/env";

/**
 * Resumes a stopped, cancelled or failed run where it stopped (see prepareResume). Prepares the
 * run; the page that resumed it then drives it with POST /api/research/[runId]/step.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/research/[runId]/resume">) {
  const auth = await requireApi("research:run");
  if (auth.denied) return auth.denied;
  const { runId } = await ctx.params;
  const run = await getRun(runId);
  const denied = run && ownerBlock(run, auth.user, "resume");
  if (denied) {
    const body: ApiErrorBody = { error: { code: "forbidden", message: denied, retryable: false } };
    return Response.json(body, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const other = run && (await activeRunId());
  if (other && other !== runId) {
    const body: ApiErrorBody = {
      error: {
        code: "busy",
        message: "Another research run is going. Stop it first.",
        retryable: false,
      },
    };
    return Response.json(body, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
  const blocked = run ? prepareResume(run, serverEnv(), auth.user.name) : "Research run not found.";
  if (!run || blocked) {
    const body: ApiErrorBody = {
      error: { code: run ? "busy" : "not_found", message: blocked!, retryable: false },
    };
    return Response.json(body, {
      status: run ? 409 : 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (!(await saveReopenedRun(run))) {
    const body: ApiErrorBody = {
      error: { code: "busy", message: "This run was already resumed.", retryable: false },
    };
    return Response.json(body, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
  const body: StartRunResponse = { runId };
  return Response.json(body, { status: 202, headers: { "Cache-Control": "no-store" } });
}
