import { saveArticle } from "@/features/articles/store";
import { requireApiSession } from "@/lib/session";

/** Saves an edit (see saveArticle for the version and status rules). */
export async function PATCH(request: Request, ctx: RouteContext<"/api/articles/[id]">) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const { id } = await ctx.params;
  const result = await saveArticle(id, await request.json().catch(() => null));
  if (result.ok) return Response.json(result.article, { headers: { "Cache-Control": "no-store" } });
  return Response.json(
    {
      error: {
        code: result.status === 409 ? "conflict" : "invalid_request",
        message: result.message,
        retryable: false,
      },
      article: result.article,
    },
    { status: result.status, headers: { "Cache-Control": "no-store" } },
  );
}
