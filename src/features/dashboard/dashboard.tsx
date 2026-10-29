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
import { ArticleReview } from "./article-review";
import { DiscoveredStories } from "./discovered-stories";
import { DashboardSummary } from "./dashboard-summary";
import { DEFAULT_SOURCES, type ResearchStatus, sourceDomain } from "./data";
import { NewsSources } from "./news-sources";
import { ResearchControls } from "./research-controls";
import { ResearchFeed, ResearchPanel } from "./research-panel";
import { ResearchProgress } from "./research-progress";
import { VerificationReview } from "./verification-review";

const POLL_INTERVAL_MS = 2_000;
/** Client gives up polling after this long (verification stops starting new work at 12 min). */
const MAX_POLL_MS = 20 * 60_000;
const MAX_POLL_FAILURES = 3;

const INITIAL_SOURCES: ConfiguredSource[] = DEFAULT_SOURCES.map((s) => ({
  id: s.id,
  name: s.name,
  url: s.url,
  domain: sourceDomain(s),
  enabled: s.enabled,
}));

type DialogState = "publish" | null;

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  return body?.error?.message ?? fallback;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Research runs are saved on the server (.data/runs, local only); nothing is published or sent to lemonn.co.in. */
export function Dashboard() {
  const [sources, setSources] = useState<ConfiguredSource[]>(INITIAL_SOURCES);
  const [researchStatus, setResearchStatus] = useState<ResearchStatus>("idle");
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    // Revisit / refresh: reload the run named in the URL (results are saved on the server).
    const runId = new URLSearchParams(window.location.search).get("run");
    if (runId && /^[0-9a-f-]{36}$/.test(runId)) {
      fetch(`/api/research/${runId}`)
        .then(async (r) => {
          if (!mounted.current) return;
          if (!r.ok) {
            window.history.replaceState(null, "", window.location.pathname);
            return;
          }
          const snapshot = (await r.json()) as ResearchRun;
          setRun(snapshot);
          if (snapshot.stage === "completed") setResearchStatus("done");
          else if (snapshot.stage === "failed") {
            setError(snapshot.error?.message ?? "Research failed.");
            setResearchStatus("error");
          } else {
            setResearchStatus("running");
            await follow(runId).catch(fail);
          }
        })
        .catch(() => {});
    }
    return () => {
      mounted.current = false;
    };
  }, []);

  const enabledSources = sources.filter((s) => s.enabled).length;
  const running = researchStatus === "running";

  function toggleSource(id: string, enabled: boolean) {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
  }

  /** Polls a run until it finishes; throws with a readable message on failure. */
  async function follow(runId: string) {
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
  }

  function fail(e: unknown) {
    if (!mounted.current) return;
    setError(e instanceof Error && e.message ? e.message : "Research failed. Please try again.");
    setResearchStatus("error");
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
      // Keep the Run ID in the URL so a refresh or revisit shows this run again.
      window.history.replaceState(null, "", `?run=${runId}`);
      await follow(runId);
    } catch (e) {
      fail(e);
    }
  }

  /**
   * Re-runs one stage for the current run (same Run ID): "verify" re-verifies failed /
   * unfinished stories, "draft" drafts queued stories without a draft.
   */
  async function retry(stage: "verify" | "draft") {
    if (running || !run) return;
    setResearchStatus("running");
    setError(null);
    try {
      const start = await fetch(`/api/research/${run.runId}/${stage}`, { method: "POST" });
      if (!start.ok) throw new Error(await readError(start, `Retry failed (${start.status}).`));
      await follow(run.runId);
    } catch (e) {
      fail(e);
    }
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
          <NewsSources sources={sources} onToggle={toggleSource} disabled={running} />
          {run && <DiscoveredStories run={run} />}
          {run && (
            <VerificationReview run={run} onRetry={() => retry("verify")} retrying={running} />
          )}
          <ArticleReview
            drafts={drafts}
            hasRun={researchStatus === "done" || (run !== null && !running)}
            onPublish={() => setDialog("publish")}
            pending={(run?.draftQueue ?? [])
              .filter((q) => !drafts.some((d) => d.candidateId === q.candidateId))
              .map((q) => ({ headline: q.headline, reason: q.draftError ?? "Not drafted yet." }))}
            onRetryDrafts={() => retry("draft")}
            busy={running}
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
    </>
  );
}
