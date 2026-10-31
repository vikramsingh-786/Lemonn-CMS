import { z } from "zod";
import { requireApi } from "@/lib/auth";
import { DEFAULT_SOURCES } from "@/features/dashboard/data";
import { needsTavily, newRun } from "@/features/research/discovery";
import { activeRunId, createRun, latestRunId } from "@/features/research/run-store";
import type { ApiErrorBody, CurrentRunResponse, StartRunResponse } from "@/features/research/types";
import { serverEnv } from "@/lib/env";

const WINDOW_HOURS = 24;

/**
 * The browser may only say WHICH configured sources to use (by id) and whether each is enabled.
 * URLs are never accepted from the client; they come from the server-side source list.
 */
const requestSchema = z
  .object({
    sources: z
      .array(z.object({ id: z.string().regex(/^[a-z0-9-]{1,40}$/), enabled: z.boolean() }).strict())
      .min(1)
      .max(DEFAULT_SOURCES.length),
  })
  .strict();

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
 * The run in progress and the latest run, so a page opened without ?run= (refresh, new tab,
 * another device) can show and resume the current research instead of looking idle.
 */
export async function GET() {
  const auth = await requireApi();
  if (auth.denied) return auth.denied;
  const [active, latest] = await Promise.all([activeRunId(), latestRunId()]);
  const body: CurrentRunResponse = { activeRunId: active, latestRunId: latest };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

/** Validate the request and create the run; the dashboard then drives it with /step requests. */
export async function POST(request: Request) {
  const auth = await requireApi("research:run");
  if (auth.denied) return auth.denied;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error(400, "invalid_request", "Invalid research request.");

  const ids = parsed.data.sources.map((s) => s.id);
  if (new Set(ids).size !== ids.length)
    return error(400, "invalid_request", "Duplicate source ids.");

  const catalog = new Map(DEFAULT_SOURCES.map((s) => [s.id, s]));
  if (ids.some((id) => !catalog.has(id)))
    return error(400, "invalid_request", "Unknown source id.");

  const enabled = parsed.data.sources.filter((s) => s.enabled).map((s) => catalog.get(s.id)!);
  if (enabled.length === 0) return error(400, "invalid_request", "Enable at least one source.");

  const env = serverEnv();
  const { TAVILY_API_KEY } = env;
  const tavilyOnly = enabled.filter(needsTavily);
  if (!TAVILY_API_KEY && tavilyOnly.length > 0) {
    return error(
      503,
      "not_configured",
      `TAVILY_API_KEY is not set on the server; it is needed for ${tavilyOnly.map((s) => s.name).join(", ")}.`,
    );
  }

  const active = await activeRunId();
  if (active) {
    // Say which run, so the page can show it (and keep it going) instead of a dead end.
    const body: ApiErrorBody = {
      error: { code: "busy", message: "A research run is already in progress.", retryable: true },
      runId: active,
    };
    return Response.json(body, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
  const end = new Date();
  const start = new Date(end.getTime() - WINDOW_HOURS * 3_600_000);
  const run = newRun(
    enabled,
    { start: start.toISOString(), end: end.toISOString() },
    auth.user.name,
  );
  await createRun(run, auth.user.id);
  const body: StartRunResponse = { runId: run.runId };
  return Response.json(body, { status: 202, headers: { "Cache-Control": "no-store" } });
}
