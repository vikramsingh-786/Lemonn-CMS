import { saveArticle } from "@/features/articles/store";
import { requireApi } from "@/lib/auth";

/** Saves an edit (see saveArticle for the version and status rules). */
export async function PATCH(request: Request, ctx: RouteContext<"/api/articles/[id]">) {
  const auth = await requireApi("articles:edit");
  if (auth.denied) return auth.denied;
  const { id } = await ctx.params;
  const result = await saveArticle(id, await request.json().catch(() => null), auth.user.id);
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
