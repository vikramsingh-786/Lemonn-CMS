"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ArticleSummary } from "@/features/articles/types";
import type { ConfiguredSource, ResearchDraft } from "@/features/research/types";
import { can, type SessionUser } from "@/lib/roles";
import { ArticleReview } from "./article-review";
import { DashboardSummary } from "./dashboard-summary";
import { NewsSources } from "./news-sources";
import { ResearchControls } from "./research-controls";
import { ResearchPanel } from "./research-panel";
import { useResearchRun } from "./use-research-run";

/**
 * Home: start research, follow its progress, and review the final drafts. The internal details
 * (discovered and ranked stories, verification) live on /research/[runId]. Runs are saved in the
 * CMS database; nothing is published or sent to lemonn.co.in.
 */
export function Dashboard({
  user,
  defaultSources,
}: {
  user: SessionUser;
  /** Every source, on or off as an admin chose; the switches start from this. */
  defaultSources: ConfiguredSource[];
}) {
  const canRun = can(user.role, "research:run");
  const canEdit = can(user.role, "articles:edit");
  const [sources, setSources] = useState<ConfiguredSource[]>(defaultSources);
  const [articles, setArticles] = useState<Record<string, ArticleSummary>>({});
  const [opening, setOpening] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const router = useRouter();
  const {
    run,
    status,
    error,
    notice,
    running,
    canRetry,
    canCancel,
    load,
    loadCurrent,
    start,
    retry,
    cancel,
  } = useResearchRun(user);
  const runId = run?.runId;
  const draftCount = run?.drafts.length ?? 0;

  // Which drafts already have an article (and its status), for the cards and filters.
  useEffect(() => {
    if (!runId || draftCount === 0) return;
    let live = true;
    fetch(`/api/articles?runId=${runId}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ articles: ArticleSummary[] }>) : null))
      .then((data) => {
        if (live && data)
          setArticles(Object.fromEntries(data.articles.map((a) => [a.candidateId, a])));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [runId, draftCount]);

  /** Opens the editor; the first time, the server creates the article from the AI draft. */
  async function editDraft(draft: ResearchDraft) {
    if (!runId) return;
    const existing = articles[draft.candidateId];
    if (existing) return router.push(`/articles/${existing.id}`);
    setOpening(draft.id);
    setEditError(null);
    const response = await fetch("/api/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, candidateId: draft.candidateId }),
    }).catch(() => null);
    if (response?.status === 401) {
      router.push(
        `/login?expired=1&next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
      return;
    }
    const data = response?.ok ? ((await response.json()) as { id: string }) : null;
    if (data) router.push(`/articles/${data.id}`);
    else {
      setOpening(null);
      setEditError("Could not open the editor for this draft. Try again.");
    }
  }

  useEffect(() => {
    // Revisit / refresh: reload the run named in the URL; without one (new tab, refresh before
    // the URL was updated, another device), show the run in progress or the latest one.
    const runId = new URLSearchParams(window.location.search).get("run");
    const show = (id: string | null) => {
      if (id) window.history.replaceState(null, "", `?run=${id}`);
    };
    if (runId)
      void load(runId).then((found) => {
        if (found) return;
        window.history.replaceState(null, "", window.location.pathname);
        void loadCurrent().then(show);
      });
    else void loadCurrent().then(show);
  }, [load, loadCurrent]);

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
          onCancel={canCancel ? () => void cancel() : undefined}
          driving={running && canRetry}
          readOnly={!canRun}
          className="shrink-0"
        />
      </div>

      <DashboardSummary
        totalSources={sources.length}
        enabledSources={enabledSources}
        researchStatus={status}
        readyToPublish={Object.values(articles).filter((a) => a.status === "ready").length}
        draftCount={drafts.length}
      />

      {notice && running && (
        <p role="status" className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          {notice}
        </p>
      )}

      {((status !== "error" && error) || editError) && (
        <p role="alert" className="text-sm text-destructive">
          {editError ?? error}
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
            canRun={canRun}
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
            cancelled={status === "cancelled"}
            articles={articles}
            onEdit={(draft) => void editDraft(draft)}
            canEdit={canEdit}
            canRun={canRetry}
            opening={opening}
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
            disabled={running || !canRun}
            canManage={can(user.role, "sources:manage")}
          />
        </div>
      </div>
    </>
  );
}
