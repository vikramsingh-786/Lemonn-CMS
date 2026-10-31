import { z } from "zod";
import { ownerBlock, prepareStoryVerification } from "@/features/research/pipeline";
import { getRun, saveRun } from "@/features/research/run-store";
import type { ApiErrorBody, StartRunResponse } from "@/features/research/types";
import { requireApi } from "@/lib/auth";

const bodySchema = z.object({ candidateId: z.string().regex(/^c\d{1,4}$/) }).strict();
const NO_STORE = { "Cache-Control": "no-store" };

function fail(status: number, code: ApiErrorBody["error"]["code"], message: string) {
  const body: ApiErrorBody = { error: { code, message, retryable: false } };
  return Response.json(body, { status, headers: NO_STORE });
}

/**
 * Verifies one story an editor chose in a finished run (owner or admin; spends API credits).
 * Prepares the run; the page then drives it with POST /api/research/[runId]/step.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/research/[runId]/verify-story">,
) {
  const auth = await requireApi("research:run");
  if (auth.denied) return auth.denied;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "invalid_request", "Invalid story.");
  const { runId } = await ctx.params;
  const run = await getRun(runId);
  if (!run) return fail(404, "not_found", "Research run not found.");
  const denied = ownerBlock(run, auth.user, "retry");
  if (denied) return fail(403, "forbidden", denied);
  const blocked = prepareStoryVerification(run, parsed.data.candidateId, auth.user.name);
  if (blocked) return fail(409, "busy", blocked);
  await saveRun(run);
  const body: StartRunResponse = { runId };
  return Response.json(body, { status: 202, headers: NO_STORE });
}
