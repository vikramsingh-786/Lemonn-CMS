import { after } from "next/server";
import { z } from "zod";
import { DEFAULT_SOURCES } from "@/features/dashboard/data";
import { needsTavily, startRun } from "@/features/research/discovery";
import type { ApiErrorBody, StartRunResponse } from "@/features/research/types";
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

/** Validate the request, then start a background run: discover → clean & rank → verify. */
export async function POST(request: Request) {
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

  const end = new Date();
  const start = new Date(end.getTime() - WINDOW_HOURS * 3_600_000);
  const started = startRun(enabled, { start: start.toISOString(), end: end.toISOString() }, env);
  if (!started) return error(409, "busy", "A research run is already in progress.", true);

  after(started.work);
  const body: StartRunResponse = { runId: started.runId };
  return Response.json(body, { status: 202, headers: { "Cache-Control": "no-store" } });
}
