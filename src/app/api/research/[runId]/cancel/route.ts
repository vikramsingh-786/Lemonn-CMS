import { cancelRun, ownerBlock } from "@/features/research/pipeline";
import { getRun, saveRun } from "@/features/research/run-store";
import type { ApiErrorBody } from "@/features/research/types";
import { requireApi } from "@/lib/auth";

const NO_STORE = { "Cache-Control": "no-store" };

/** Stops a research run (see cancelRun) and returns the cancelled snapshot. */
export async function POST(_request: Request, ctx: RouteContext<"/api/research/[runId]/cancel">) {
  const auth = await requireApi("research:run");
  if (auth.denied) return auth.denied;
  const { runId } = await ctx.params;
  const run = await getRun(runId);
  const denied = run && ownerBlock(run, auth.user, "cancel");
  if (denied) {
    const body: ApiErrorBody = { error: { code: "forbidden", message: denied, retryable: false } };
    return Response.json(body, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const blocked = run ? cancelRun(run, auth.user.name) : "Research run not found.";
  if (!run || blocked) {
    const body: ApiErrorBody = {
      error: { code: run ? "busy" : "not_found", message: blocked!, retryable: false },
    };
    return Response.json(body, { status: run ? 409 : 404, headers: NO_STORE });
  }
  await saveRun(run);
  return Response.json(run, { headers: NO_STORE });
}
