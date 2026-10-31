import { loadOffTopic } from "@/features/research/run-store";
import { requireApi } from "@/lib/auth";

/** Stories a run's discovery dropped as off-topic (any signed-in role). */
export async function GET(_request: Request, ctx: RouteContext<"/api/research/[runId]/off-topic">) {
  const auth = await requireApi();
  if (auth.denied) return auth.denied;
  const { runId } = await ctx.params;
  return Response.json(
    { items: await loadOffTopic(runId) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
