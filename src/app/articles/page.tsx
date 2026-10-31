import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ArticlesList } from "@/features/articles/articles-list";
import { listArticles } from "@/features/articles/store";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Articles · Lemonn Newsroom" };

async function Articles() {
  await requireUser("/articles"); // checks the session itself (not only the proxy)
  return <ArticlesList articles={await listArticles()} />;
}

export default function ArticlesPage() {
  return (
    <AppShell>
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Articles</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Drafts opened for editing, from every research run. An article is marked ready when it is
          checked and complete; nothing is published yet.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading articles…</p>}>
        <Articles />
      </Suspense>
    </AppShell>
  );
}
