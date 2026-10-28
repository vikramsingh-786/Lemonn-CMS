import { after } from "next/server";
import { startDraftRetry } from "@/features/research/discovery";
import type { ApiErrorBody, StartRunResponse } from "@/features/research/types";
import { serverEnv } from "@/lib/env";

/**
 * (Re)draft queued stories of an existing run that have no draft or whose drafting failed (same
 * Run ID). Discovery, ranking and verification are not repeated. Poll GET /api/research/[runId].
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/research/[runId]/draft">) {
  const { runId } = await ctx.params;
  const started = await startDraftRetry(runId, serverEnv());
  if (!started.ok) {
    const body: ApiErrorBody = {
      error: {
        code: started.status === 404 ? "not_found" : "busy",
        message: started.message,
        retryable: started.status === 409,
      },
    };
    return Response.json(body, {
      status: started.status,
      headers: { "Cache-Control": "no-store" },
    });
  }
  after(started.work);
  const body: StartRunResponse = { runId };
  return Response.json(body, { status: 202, headers: { "Cache-Control": "no-store" } });
}
