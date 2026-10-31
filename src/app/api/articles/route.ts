import { z } from "zod";
import { articleForDraft, listArticles } from "@/features/articles/store";
import { requireApiSession } from "@/lib/session";

const NO_STORE = { "Cache-Control": "no-store" };

/** Articles, newest edits first; `?runId=` limits them to one research run. */
export async function GET(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const runId = new URL(request.url).searchParams.get("runId") ?? undefined;
  return Response.json({ articles: await listArticles(runId) }, { headers: NO_STORE });
}

const openSchema = z
  .object({ runId: z.string().max(40), candidateId: z.string().min(1).max(40) })
  .strict();

/** Opens the editor's article for a draft, creating it from the AI draft the first time. */
export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const parsed = openSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: { code: "invalid_request", message: "Invalid request.", retryable: false } },
      { status: 400, headers: NO_STORE },
    );
  const article = await articleForDraft(parsed.data.runId, parsed.data.candidateId);
  if (!article)
    return Response.json(
      { error: { code: "not_found", message: "Draft not found.", retryable: false } },
      { status: 404, headers: NO_STORE },
    );
  return Response.json({ id: article.id }, { headers: NO_STORE });
}
