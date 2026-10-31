import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { SideRail } from "@/components/layout/side-rail";
import { ArticlesList } from "@/features/articles/articles-list";
import { listArticles } from "@/features/articles/store";

export const metadata: Metadata = { title: "Articles · Lemonn Newsroom" };

async function Articles() {
  await connection(); // read the database per request
  return <ArticlesList articles={await listArticles()} />;
}

export default function ArticlesPage() {
  return (
    <>
      <Header />
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 gap-6 px-3 pt-2 pb-6 sm:px-6">
        <SideRail />
        <main className="app-canvas flex min-w-0 flex-1 flex-col gap-5 rounded-[28px] bg-canvas p-4 sm:rounded-[32px] sm:p-6 lg:p-7">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Articles
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Drafts you have opened for editing, from every research run. Mark an article ready
              when it is checked and complete; nothing is published yet.
            </p>
          </div>
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading articles…</p>}>
            <Articles />
          </Suspense>
        </main>
      </div>
      <Footer />
    </>
  );
}
