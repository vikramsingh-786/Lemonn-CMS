"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import type {
  ApiErrorBody,
  ConfiguredSource,
  ResearchRun,
  StartRunResponse,
} from "@/features/research/types";
import { AddSourceDialog } from "./add-source-dialog";
import { ArticleReview } from "./article-review";
import { CandidateReview } from "./candidate-review";
import { DashboardSummary } from "./dashboard-summary";
import { DEFAULT_SOURCES, type ResearchStatus, sourceDomain } from "./data";
import { NewsSources } from "./news-sources";
import { ResearchControls } from "./research-controls";
import { ResearchFeed, ResearchPanel } from "./research-panel";
import { ResearchProgress } from "./research-progress";

const POLL_INTERVAL_MS = 2_000;
/** Client gives up polling after this long (the server stops starting new work at 8 min). */
const MAX_POLL_MS = 12 * 60_000;
const MAX_POLL_FAILURES = 3;

const INITIAL_SOURCES: ConfiguredSource[] = DEFAULT_SOURCES.map((s) => ({
  id: s.id,
  name: s.name,
  url: s.url,
  domain: sourceDomain(s),
  isPrimarySource: s.isPrimarySource ?? false,
  enabled: s.enabled,
}));

type DialogState = "publish" | "add-source" | null;

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  return body?.error?.message ?? fallback;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Research state lives on the server in memory; nothing is persisted, published or sent to lemonn.co.in. */
export function Dashboard() {
  const [sources, setSources] = useState<ConfiguredSource[]>(INITIAL_SOURCES);
  const [researchStatus, setResearchStatus] = useState<ResearchStatus>("idle");
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    // Sync with the server's source list (sources added/removed earlier in this server session).
    fetch("/api/sources")
      .then((r) => (r.ok ? (r.json() as Promise<{ sources: ConfiguredSource[] }>) : null))
      .then((data) => {
        if (!data || !mounted.current) return;
        setSources((current) => {
          const enabled = new Map(current.map((s) => [s.id, s.enabled]));
          return data.sources.map((s) => ({ ...s, enabled: enabled.get(s.id) ?? s.enabled }));
        });
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
    };
  }, []);

  const enabledSources = sources.filter((s) => s.enabled).length;
  const running = researchStatus === "running";

  function toggleSource(id: string, enabled: boolean) {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
  }

  async function removeSource(source: ConfiguredSource) {
    const response = await fetch(`/api/sources/${encodeURIComponent(source.id)}`, {
      method: "DELETE",
    }).catch(() => null);
    if (response?.ok || response?.status === 404) {
      setSources((prev) => prev.filter((s) => s.id !== source.id));
    } else {
      setError(
        response
          ? await readError(response, "Could not remove the source.")
          : "Could not reach the server.",
      );
    }
  }

  async function runResearch() {
    if (running) return;
    setResearchStatus("running");
    setError(null);
    setRun(null);
    try {
      const start = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: sources.map(({ id, enabled }) => ({ id, enabled })) }),
      });
      if (!start.ok) throw new Error(await readError(start, `Research failed (${start.status}).`));
      const { runId } = (await start.json()) as StartRunResponse;

      // Poll for progress until the run finishes.
      const startedAt = Date.now();
      let failures = 0;
      while (mounted.current) {
        await sleep(POLL_INTERVAL_MS);
        if (Date.now() - startedAt > MAX_POLL_MS) {
          throw new Error("Research is taking too long. Check again later.");
        }
        const response = await fetch(`/api/research/${runId}`).catch(() => null);
        if (!response?.ok) {
          if (response?.status === 404)
            throw new Error(await readError(response, "The run was lost."));
          if (++failures >= MAX_POLL_FAILURES) {
            throw new Error("Lost contact with the server while researching.");
          }
          continue;
        }
        failures = 0;
        const snapshot = (await response.json()) as ResearchRun;
        if (!mounted.current) return;
        setRun(snapshot);
        if (snapshot.stage === "failed")
          throw new Error(snapshot.error?.message ?? "Research failed.");
        if (snapshot.stage === "completed") {
          setResearchStatus("done");
          return;
        }
      }
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error && e.message ? e.message : "Research failed. Please try again.");
      setResearchStatus("error");
    }
  }

  const drafts = run?.drafts ?? [];

  return (
    <>
      {/* Hero: title on the left, primary action on the right. */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="warning">Prototype · Results not saved</Badge>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            News Research Dashboard
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
            Manage news sources, research market developments, and prepare articles for publication.
          </p>
        </div>
        <ResearchControls
          status={researchStatus}
          enabledSources={enabledSources}
          onResearch={runResearch}
          className="shrink-0"
        />
      </div>

      <DashboardSummary
        totalSources={sources.length}
        enabledSources={enabledSources}
        researchStatus={researchStatus}
        readyToPublish={0}
        draftCount={drafts.length}
      />

      {researchStatus !== "error" && error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Main column + sticky right panel (stacks on smaller screens). */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <aside className="flex flex-col gap-5 xl:sticky xl:top-24 xl:order-last">
          <ResearchPanel
            status={researchStatus}
            run={run}
            error={error}
            enabledSources={enabledSources}
            totalSources={sources.length}
            onResearch={runResearch}
          />
          <ResearchFeed run={run} />
        </aside>

        <div className="flex min-w-0 flex-col gap-5">
          {run && <ResearchProgress run={run} />}
          <NewsSources
            sources={sources}
            onToggle={toggleSource}
            onAddSource={() => setDialog("add-source")}
            onRemove={removeSource}
            disabled={running}
          />
          {run && <CandidateReview candidates={run.candidates} />}
          <ArticleReview
            drafts={drafts}
            hasRun={researchStatus === "done"}
            onPublish={() => setDialog("publish")}
          />
        </div>
      </div>

      <Dialog
        open={dialog === "publish"}
        onClose={() => setDialog(null)}
        title="Publishing is not connected"
      >
        No article has been published. Publishing to the Lemonn website is not connected yet, and
        this draft was not sent anywhere. It stays private in this prototype.
      </Dialog>
      <AddSourceDialog
        open={dialog === "add-source"}
        sourceCount={sources.length}
        onClose={() => setDialog(null)}
        onAdded={(source) => setSources((prev) => [...prev, source])}
      />
    </>
  );
}
