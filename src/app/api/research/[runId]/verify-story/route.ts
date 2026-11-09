import { z } from "zod";
import { ownerBlock, prepareStoryVerification } from "@/features/research/pipeline";
import { getRun, saveRun, withRunLock } from "@/features/research/run-store";
import type { ApiErrorBody, StartRunResponse } from "@/features/research/types";
import { requireApi } from "@/lib/auth";
import { db } from "@/lib/db";

const bodySchema = z.object({ candidateId: z.string().regex(/^c\d{1,4}$/) }).strict();
const NO_STORE = { "Cache-Control": "no-store" };

function fail(
  status: number,
  code: ApiErrorBody["error"]["code"],
  message: string,
  retryable = false,
) {
  const body: ApiErrorBody = { error: { code, message, retryable } };
  return Response.json(body, { status, headers: NO_STORE });
}

/**
 * Verifies one story an editor chose in a finished run (owner or admin; spends API credits).
 * Not for a story that already has an article: re-verifying would replace the claims and evidence
 * its editor relies on. Prepares the run under its lock (two clicks can't overwrite each other);
 * the page then drives it with POST /api/research/[runId]/step.
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
  const owned = await getRun(runId);
  if (!owned) return fail(404, "not_found", "Research run not found.");
  const denied = ownerBlock(owned, auth.user, "retry");
  if (denied) return fail(403, "forbidden", denied);
  const { candidateId } = parsed.data;
  const article = await db().article.findUnique({
    where: { runId_candidateId: { runId, candidateId } },
    select: { id: true },
  });
  if (article)
    return fail(
      409,
      "busy",
      "This story already has an article; re-verifying it would change the article's fact sheet.",
    );
  // Refused without touching the run (no lock) when the story can't be queued anyway.
  const early = prepareStoryVerification(structuredClone(owned), candidateId, auth.user.name);
  if (early) return fail(409, "busy", early);
  const result = await withRunLock(runId, async () => {
    const run = await getRun(runId, { stopAbandoned: true });
    if (!run) return fail(404, "not_found", "Research run not found.");
    const blocked = prepareStoryVerification(run, candidateId, auth.user.name);
    if (blocked) return fail(409, "busy", blocked);
    if (!(await saveRun(run))) return fail(409, "busy", "This run changed meanwhile; reload it.");
    const body: StartRunResponse = { runId };
    return Response.json(body, { status: 202, headers: NO_STORE });
  });
  return result ?? fail(409, "busy", "This run is being worked on; try again shortly.", true);
}
