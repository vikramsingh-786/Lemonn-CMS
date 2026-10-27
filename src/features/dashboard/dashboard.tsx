"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { ArticleReview } from "./article-review";
import { DashboardSummary } from "./dashboard-summary";
import { NewsSources } from "./news-sources";
import { ResearchControls } from "./research-controls";
import { DEFAULT_SOURCES, SAMPLE_ARTICLE, type Article, type ResearchStatus } from "./data";

const DEMO_RESEARCH_MS = 2000;

type DialogState = { kind: "publish"; article: Article } | { kind: "add-source" } | null;

/** Frontend-only demo: all state is local; nothing is fetched, saved or published. */
export function Dashboard() {
  const [sources, setSources] = useState(DEFAULT_SOURCES);
  const [researchStatus, setResearchStatus] = useState<ResearchStatus>("idle");
  const [articles, setArticles] = useState<readonly Article[]>([]);
  const [dialog, setDialog] = useState<DialogState>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const enabledSources = sources.filter((s) => s.enabled).length;
  const readyToPublish = articles.filter((a) => a.status === "ready").length;

  function toggleSource(id: string, enabled: boolean) {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
  }

  function runDemoResearch() {
    if (researchStatus === "running") return;
    setResearchStatus("running");
    timer.current = setTimeout(() => {
      setResearchStatus("done");
      setArticles([SAMPLE_ARTICLE]);
    }, DEMO_RESEARCH_MS);
  }

  return (
    <>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="warning">Demo · Backend not connected</Badge>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            News Research Dashboard
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground sm:text-base">
            Manage news sources, research market developments, and prepare articles for publication.
          </p>
        </div>
        <ResearchControls
          status={researchStatus}
          enabledSources={enabledSources}
          onResearch={runDemoResearch}
        />
      </div>

      <div role="status" aria-live="polite">
        {researchStatus === "done" && (
          <p className="flex items-start gap-2 rounded-lg border border-success/25 bg-success-soft px-4 py-3 text-sm text-success">
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
            Demo research completed. Backend integration is not connected, so no real news was
            collected.
          </p>
        )}
      </div>

      <DashboardSummary
        totalSources={sources.length}
        enabledSources={enabledSources}
        researchStatus={researchStatus}
        readyToPublish={readyToPublish}
      />

      <NewsSources
        sources={sources}
        onToggle={toggleSource}
        onAddSource={() => setDialog({ kind: "add-source" })}
      />

      <ArticleReview
        articles={articles}
        onPublish={(article) => setDialog({ kind: "publish", article })}
      />

      <Dialog
        open={dialog?.kind === "publish"}
        onClose={() => setDialog(null)}
        title="Publishing is a demo"
      >
        No article has been published. Publishing to the Lemonn website is not connected yet, and
        nothing was sent anywhere.
      </Dialog>
      <Dialog
        open={dialog?.kind === "add-source"}
        onClose={() => setDialog(null)}
        title="Adding sources is not available yet"
      >
        Source management will be saved once the backend is connected. For now, use the toggles to
        choose which of the 10 starting sources to include.
      </Dialog>
    </>
  );
}
