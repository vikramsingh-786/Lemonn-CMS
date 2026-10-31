import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { SideRail } from "@/components/layout/side-rail";
import { ArticleEditor } from "@/features/articles/article-editor";
import { getArticle, getArticleContext } from "@/features/articles/store";

export const metadata: Metadata = { title: "Edit article · Lemonn Newsroom" };

async function Editor({ params }: Pick<PageProps<"/articles/[id]">, "params">) {
  await connection();
  const article = await getArticle((await params).id);
  const context = article && (await getArticleContext(article));
  if (!article || !context) notFound();
  return <ArticleEditor initial={article} context={context} />;
}

export default function ArticleEditorPage({ params }: PageProps<"/articles/[id]">) {
  return (
    <>
      <Header />
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 gap-6 px-3 pt-2 pb-6 sm:px-6">
        <SideRail />
        <main className="app-canvas flex min-w-0 flex-1 flex-col gap-5 rounded-[28px] bg-canvas p-4 sm:rounded-[32px] sm:p-6 lg:p-7">
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading article…</p>}>
            <Editor params={params} />
          </Suspense>
        </main>
      </div>
      <Footer />
    </>
  );
}
