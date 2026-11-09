import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ArticleEditor } from "@/features/articles/article-editor";
import { getArticle, getArticleContext } from "@/features/articles/store";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/roles";

export const metadata: Metadata = { title: "Article · Lemonn Newsroom" };

/**
 * Blocking route: the article is looked up before anything is streamed, so an unknown or deleted
 * article answers with a real 404 (inside a Suspense boundary notFound() came after a 200).
 */
export const instant = false;

export default async function ArticleEditorPage({ params }: PageProps<"/articles/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/articles/${id}`);
  const article = await getArticle(id);
  const context = article && (await getArticleContext(article));
  if (!article || !context) notFound();
  return (
    <AppShell>
      <ArticleEditor
        initial={article}
        context={context}
        canEdit={can(user.role, "articles:edit")}
      />
    </AppShell>
  );
}
