import { runStep } from "@/features/research/pipeline";
import { requireApi } from "@/lib/auth";
import { claimStep, getRun, isRunId, releaseStep, saveRun } from "@/features/research/run-store";
import type { ApiErrorBody } from "@/features/research/types";
import { serverEnv } from "@/lib/env";

/** One step may take this long (Vercel Fluid compute allows up to 300 s on every plan). */
export const maxDuration = 300;
/** The run stays locked a little longer than a step can last, so a cut-off step frees it. */
const LOCK_MS = (maxDuration + 30) * 1000;

function error(
  status: number,
  code: ApiErrorBody["error"]["code"],
  message: string,
  retryable = false,
) {
  const body: ApiErrorBody = { error: { code, message, retryable } };
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Runs the next bounded step of a research run and returns the saved snapshot. The dashboard calls
 * this in a loop until the run is completed or failed. 409 while another request holds the run.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/research/[runId]/step">) {
  const auth = await requireApi("research:run");
  if (auth.denied) return auth.denied;
  const { runId } = await ctx.params;
  if (!isRunId(runId)) return error(404, "not_found", "Research run not found.");
  if (!(await claimStep(runId, LOCK_MS)))
    return error(409, "busy", "This run is being worked on; try again shortly.", true);
  try {
    const run = await getRun(runId);
    if (!run) return error(404, "not_found", "Research run not found.");
    await runStep(run, serverEnv());
    await saveRun(run);
    return Response.json(run, { headers: { "Cache-Control": "no-store" } });
  } finally {
    await releaseStep(runId);
  }
}
