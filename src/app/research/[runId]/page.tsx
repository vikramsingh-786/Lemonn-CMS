import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ResearchDetails } from "@/features/dashboard/research-details";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Research details · Lemonn Newsroom" };

/** Reads the Run ID from the URL (runtime data, so it renders inside a Suspense boundary). */
async function Details({ params }: Pick<PageProps<"/research/[runId]">, "params">) {
  const { runId } = await params;
  const user = await requireUser(`/research/${runId}`);
  return <ResearchDetails runId={runId} user={user} />;
}

export default function ResearchPage({ params }: PageProps<"/research/[runId]">) {
  return (
    <AppShell>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading research run…</p>}>
        <Details params={params} />
      </Suspense>
    </AppShell>
  );
}
