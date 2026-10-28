import { connection } from "next/server";
import { getRun } from "@/features/research/discovery";
import type { ApiErrorBody } from "@/features/research/types";

/** Snapshot of a research run, polled by the dashboard. */
export async function GET(_request: Request, ctx: RouteContext<"/api/research/[runId]">) {
  await connection();
  const { runId } = await ctx.params;
  const run = getRun(runId);
  if (!run) {
    const body: ApiErrorBody = {
      error: { code: "not_found", message: "Research run not found.", retryable: false },
    };
    return Response.json(body, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(run, { headers: { "Cache-Control": "no-store" } });
}
