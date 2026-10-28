import { after } from "next/server";
import { startVerificationRetry } from "@/features/research/discovery";
import type { ApiErrorBody, StartRunResponse } from "@/features/research/types";
import { serverEnv } from "@/lib/env";

/**
 * Retry verification for an existing run (same Run ID): only failed / not-processed stories are
 * verified again. Discovery and ranking are not repeated. Poll GET /api/research/[runId].
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/research/[runId]/verify">) {
  const { runId } = await ctx.params;
  const started = await startVerificationRetry(runId, serverEnv());
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
