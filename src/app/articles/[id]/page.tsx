import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ArticleEditor } from "@/features/articles/article-editor";
import { getArticle, getArticleContext } from "@/features/articles/store";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/roles";

export const metadata: Metadata = { title: "Article · Lemonn Newsroom" };

async function Editor({ params }: Pick<PageProps<"/articles/[id]">, "params">) {
  const { id } = await params;
  const user = await requireUser(`/articles/${id}`);
  const article = await getArticle(id);
  const context = article && (await getArticleContext(article));
  if (!article || !context) notFound();
  return (
    <ArticleEditor initial={article} context={context} canEdit={can(user.role, "articles:edit")} />
  );
}

export default function ArticleEditorPage({ params }: PageProps<"/articles/[id]">) {
  return (
    <AppShell>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading article…</p>}>
        <Editor params={params} />
      </Suspense>
    </AppShell>
  );
}
