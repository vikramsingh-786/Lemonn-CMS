import { connection } from "next/server";
import { requireApiSession } from "@/lib/session";
import { getRun } from "@/features/research/run-store";
import type { ApiErrorBody } from "@/features/research/types";

/** Snapshot of a research run from the database (no evidence passages). */
export async function GET(_request: Request, ctx: RouteContext<"/api/research/[runId]">) {
  const denied = await requireApiSession();
  if (denied) return denied;
  await connection();
  const { runId } = await ctx.params;
  const run = await getRun(runId);
  if (!run) {
    const body: ApiErrorBody = {
      error: { code: "not_found", message: "Research run not found.", retryable: false },
    };
    return Response.json(body, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(run, { headers: { "Cache-Control": "no-store" } });
}
