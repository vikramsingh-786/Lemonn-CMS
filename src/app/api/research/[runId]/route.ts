import { connection } from "next/server";
import { requireApi } from "@/lib/auth";
import { deleteRun, getRun, isActive } from "@/features/research/run-store";
import { db } from "@/lib/db";
import type { ApiErrorBody } from "@/features/research/types";

/** Snapshot of a research run from the database (no evidence passages). */
export async function GET(_request: Request, ctx: RouteContext<"/api/research/[runId]">) {
  const auth = await requireApi();
  if (auth.denied) return auth.denied;
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

/** Deletes a run and its articles (admins only). A run that is going must be stopped first. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/research/[runId]">) {
  const auth = await requireApi("runs:manage");
  if (auth.denied) return auth.denied;
  const { runId } = await ctx.params;
  // getRun first: it stops the run if abandoned, so only a run really going is refused.
  const row =
    (await getRun(runId)) &&
    (await db().researchRun.findUnique({
      where: { id: runId },
      select: { stage: true, updatedAt: true, stepLockUntil: true },
    }));
  const fail = (status: number, code: ApiErrorBody["error"]["code"], message: string) =>
    Response.json({ error: { code, message, retryable: false } } satisfies ApiErrorBody, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  if (!row) return fail(404, "not_found", "Research run not found.");
  if (isActive(row)) return fail(409, "busy", "This run is still going. Stop it first.");
  await deleteRun(runId);
  return new Response(null, { status: 204 });
}
