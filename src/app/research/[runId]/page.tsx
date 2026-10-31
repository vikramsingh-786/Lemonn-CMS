import type { Metadata } from "next";
import { Suspense } from "react";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { SideRail } from "@/components/layout/side-rail";
import { ResearchDetails } from "@/features/dashboard/research-details";

export const metadata: Metadata = { title: "Research details · Lemonn Newsroom" };

/** Reads the Run ID from the URL (runtime data, so it renders inside a Suspense boundary). */
async function Details({ params }: Pick<PageProps<"/research/[runId]">, "params">) {
  const { runId } = await params;
  return <ResearchDetails runId={runId} />;
}

export default function ResearchPage({ params }: PageProps<"/research/[runId]">) {
  return (
    <>
      <Header />
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 gap-6 px-3 pt-2 pb-6 sm:px-6">
        <SideRail />
        <main className="app-canvas flex min-w-0 flex-1 flex-col gap-5 rounded-[28px] bg-canvas p-4 sm:rounded-[32px] sm:p-6 lg:p-7">
          <Suspense
            fallback={<p className="text-sm text-muted-foreground">Loading research run…</p>}
          >
            <Details params={params} />
          </Suspense>
        </main>
      </div>
      <Footer />
    </>
  );
}
