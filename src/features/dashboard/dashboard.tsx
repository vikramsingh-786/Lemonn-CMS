"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import type { ConfiguredSource } from "@/features/research/types";
import { ArticleReview } from "./article-review";
import { DashboardSummary } from "./dashboard-summary";
import { DEFAULT_SOURCES, sourceDomain } from "./data";
import { NewsSources } from "./news-sources";
import { ResearchControls } from "./research-controls";
import { ResearchPanel } from "./research-panel";
import { useResearchRun } from "./use-research-run";

const INITIAL_SOURCES: ConfiguredSource[] = DEFAULT_SOURCES.map((s) => ({
  id: s.id,
  name: s.name,
  url: s.url,
  domain: sourceDomain(s),
  enabled: s.enabled,
}));

/**
 * Home: start research, follow its progress, and review the final drafts. The internal details
 * (discovered and ranked stories, verification) live on /research/[runId]. Runs are saved in the
 * CMS database; nothing is published or sent to lemonn.co.in.
 */
export function Dashboard() {
  const [sources, setSources] = useState<ConfiguredSource[]>(INITIAL_SOURCES);
  const [publishOpen, setPublishOpen] = useState(false);
  const { run, status, error, running, load, start, retry } = useResearchRun();

  useEffect(() => {
    // Revisit / refresh: reload the run named in the URL (results are saved on the server).
    const runId = new URLSearchParams(window.location.search).get("run");
    if (runId)
      void load(runId).then((found) => {
        if (!found) window.history.replaceState(null, "", window.location.pathname);
      });
  }, [load]);

  const enabledSources = sources.filter((s) => s.enabled).length;

  function runResearch() {
    if (running) return;
    void start(
      sources.map(({ id, enabled }) => ({ id, enabled })),
      // Keep the Run ID in the URL so a refresh or revisit shows this run again.
      (runId) => window.history.replaceState(null, "", `?run=${runId}`),
    );
  }

  const drafts = run?.drafts ?? [];

  return (
    <>
      {/* Hero: title on the left, primary action on the right. */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="warning">Prototype · Nothing is published</Badge>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            News Research Dashboard
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
            Choose news sources, research market developments, and review evidence-backed drafts.
          </p>
        </div>
        <ResearchControls
          status={status}
          enabledSources={enabledSources}
          onResearch={runResearch}
          className="shrink-0"
        />
      </div>

      <DashboardSummary
        totalSources={sources.length}
        enabledSources={enabledSources}
        researchStatus={status}
        readyToPublish={0}
        draftCount={drafts.length}
      />

      {status !== "error" && error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Main column + sticky right panel (stacks on smaller screens). */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <aside className="flex min-w-0 flex-col gap-5 xl:sticky xl:top-24 xl:order-last">
          <ResearchPanel
            status={status}
            run={run}
            error={error}
            enabledSources={enabledSources}
            totalSources={sources.length}
            onResearch={runResearch}
          />
          {run && (
            <Link
              href={`/research/${run.runId}`}
              className="surface-raised group flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-5 py-4 text-sm transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span>
                <span className="block font-medium">Internal research details</span>
                <span className="text-xs text-muted-foreground">
                  Discovered and ranked stories, verification evidence
                </span>
              </span>
              <ArrowRight
                aria-hidden
                className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          )}
        </aside>

        <div className="flex min-w-0 flex-col gap-5">
          <ArticleReview
            drafts={drafts}
            hasRun={status === "done" || (run !== null && !running)}
            onPublish={() => setPublishOpen(true)}
            pending={(run?.draftQueue ?? [])
              .filter((q) => !drafts.some((d) => d.candidateId === q.candidateId))
              .map((q) => ({ headline: q.headline, reason: q.draftError ?? "Not drafted yet." }))}
            onRetryDrafts={() => void retry("draft")}
            busy={running}
          />
          <NewsSources
            sources={sources}
            onToggle={(id, enabled) =>
              setSources((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)))
            }
            disabled={running}
          />
        </div>
      </div>

      <Dialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="Publishing is not connected"
      >
        No article has been published. Publishing to the Lemonn website is not connected yet, and
        this draft was not sent anywhere. It stays private in this prototype.
      </Dialog>
    </>
  );
}
