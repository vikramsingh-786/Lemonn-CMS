"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DiscoveredStories } from "./discovered-stories";
import { ResearchFeed } from "./research-panel";
import { ResearchProgress } from "./research-progress";
import { useResearchRun } from "./use-research-run";
import { VerificationReview } from "./verification-review";

/**
 * Internal view of one run: pipeline counts, source coverage, discovered and ranked stories,
 * verification evidence and the live feed. Drives the run while it is unfinished, like the home.
 */
export function ResearchDetails({ runId }: { runId: string }) {
  const { run, status, error, notFound, running, load, retry } = useResearchRun();

  useEffect(() => {
    void load(runId);
  }, [load, runId]);

  return (
    <>
      <div className="flex flex-col gap-3">
        <Link
          href={`/?run=${runId}`}
          className="inline-flex w-fit items-center gap-1.5 rounded text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Dashboard and drafts
        </Link>
        <div>
          <Badge variant="neutral">Internal</Badge>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Research details
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
            How this run found, ranked and verified its stories. Final drafts are on the dashboard.
          </p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">Run {runId}</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notFound && (
        <p role="alert" className="text-sm text-destructive">
          Research run not found.
        </p>
      )}
      {!run && !notFound && status !== "error" && (
        <p className="text-sm text-muted-foreground">Loading research run…</p>
      )}

      {run && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <aside className="flex flex-col gap-5 xl:sticky xl:top-24 xl:order-last">
            <ResearchFeed run={run} />
          </aside>
          <div className="flex min-w-0 flex-col gap-5">
            <ResearchProgress run={run} />
            <DiscoveredStories run={run} />
            <VerificationReview run={run} onRetry={() => void retry("verify")} retrying={running} />
          </div>
        </div>
      )}
    </>
  );
}
