import { z } from "zod";
import { DEFAULT_SOURCES, sourceDomain } from "@/features/dashboard/data";
import type { ApiErrorBody, ResearchRequestAccepted } from "@/features/research/types";
import { MAX_SOURCES } from "@/features/sources/validation";

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
      .max(MAX_SOURCES),
  })
  .strict();

function error(status: number, message: string) {
  const body: ApiErrorBody = { error: { code: "invalid_request", message, retryable: false } };
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Step 1 of the research API: validate the request and report what would be researched.
 * Nothing is searched yet (no Tavily/Gemini calls, no credits used).
 */
export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error(400, "Invalid research request.");

  const ids = parsed.data.sources.map((s) => s.id);
  if (new Set(ids).size !== ids.length) return error(400, "Duplicate source ids.");

  const catalog = new Map(DEFAULT_SOURCES.map((s) => [s.id, s]));
  if (ids.some((id) => !catalog.has(id))) return error(400, "Unknown source id.");

  const enabled = parsed.data.sources.filter((s) => s.enabled).map((s) => catalog.get(s.id)!);
  if (enabled.length === 0) return error(400, "Enable at least one source.");

  const end = new Date();
  const start = new Date(end.getTime() - WINDOW_HOURS * 3_600_000);
  const body: ResearchRequestAccepted = {
    accepted: true,
    window: { start: start.toISOString(), end: end.toISOString() },
    sources: enabled.map((s) => ({ id: s.id, name: s.name, domain: sourceDomain(s) })),
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
