import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ResearchDetails } from "@/features/dashboard/research-details";
import { isRunId } from "@/features/research/run-store";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Research details · Lemonn Newsroom" };

/** Blocking route: an unknown run answers with a real 404 before anything is streamed. */
export const instant = false;

export default async function ResearchPage({ params }: PageProps<"/research/[runId]">) {
  const { runId } = await params;
  const user = await requireUser(`/research/${runId}`);
  const exists =
    isRunId(runId) &&
    (await db().researchRun.findUnique({ where: { id: runId }, select: { id: true } }));
  if (!exists) notFound();
  return (
    <AppShell>
      <ResearchDetails runId={runId} user={user} />
    </AppShell>
  );
}
