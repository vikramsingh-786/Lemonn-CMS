import { CircleAlert, CircleCheck, CircleMinus, Info, TriangleAlert } from "lucide-react";
import type { ResearchRun, SourceCoverage } from "@/features/research/types";
import { formatIst } from "./format";

const COVERAGE_ICON: Record<SourceCoverage["status"], React.ReactNode> = {
  ok: <CircleCheck aria-hidden className="size-3.5 text-success" />,
  no_results: <CircleMinus aria-hidden className="size-3.5 text-muted-foreground" />,
  failed: <CircleAlert aria-hidden className="size-3.5 text-destructive" />,
};

const STAGE_LABEL: Record<ResearchRun["stage"], string> = {
  discovering: "Discovering stories",
  expanding: "Expanding search",
  ranking: "Cleaning and ranking",
  drafting: "Drafting articles",
  processing: "Verifying claims",
  completed: "Completed",
  failed: "Failed",
};

const ERROR_LABEL: Record<string, string> = {
  timeout: "timeouts",
  rate_limit: "rate limits",
  quota: "quota exhausted",
  auth: "auth failures",
  unavailable: "service errors",
  bad_response: "invalid responses",
  bad_request: "rejected requests",
  blocked: "blocked fetches",
  not_configured: "missing configuration",
  budget: "call limits reached",
};

const PROVIDER_LABEL: Record<string, string> = {
  gemini: "Gemini",
  tavily: "Tavily",
  sitemap: "sitemap",
  fetch: "page fetch",
  verify: "verification",
};

/** Live, honest view of what the run has actually done so far. */
export function ResearchProgress({ run }: { run: ResearchRun }) {
  const { counts } = run;
  const stats = [
    ["In window", counts.resultsFound],
    ["Off-topic", run.coverage.reduce((n, c) => n + c.offTopic, 0)],
    ["Discovered", run.items.length],
    ["Duplicates merged", counts.duplicatesRemoved],
    ["Excluded", run.excluded.length],
    ["Candidates", counts.uniqueCandidates],
    ["Verified · held", `${counts.verified} · ${counts.held}`],
    ["Not processed", counts.notProcessed],
    ["Draft queue", `${run.draftQueue.length} / ${run.draftTarget}`],
    [
      "Pages read · blocked",
      `${counts.pagesFetched}/${counts.pagesAttempted} · ${counts.pagesBlocked}`,
    ],
    [
      "Sources OK",
      `${run.coverage.filter((c) => c.status === "ok").length} / ${run.coverage.length}`,
    ],
    ["Tavily · AI calls", `${counts.searchesUsed} · ${counts.aiCallsUsed}`],
  ] as const;
  const topics = Object.entries(run.topicCounts);
  const errors = Object.entries(run.errorCounts);

  return (
    <section
      aria-labelledby="run-heading"
      className="surface-raised rounded-lg border border-border bg-card px-5 py-4 sm:px-6 sm:py-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="run-heading" className="font-display text-lg font-semibold tracking-tight">
          Research run · {STAGE_LABEL[run.stage]}
        </h2>
        <p className="text-xs text-muted-foreground">
          Window {formatIst(run.window.start)} – {formatIst(run.window.end)} · Run{" "}
          <span className="font-mono">{run.runId}</span>
        </p>
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">{run.stageDetail}</p>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="pill-raised rounded-2xl bg-muted px-3.5 py-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {run.timings.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground tabular-nums">
          {run.timings
            .map((t) => `${t.stage.replace(/_/g, " ")} ${(t.ms / 1000).toFixed(1)}s`)
            .join(" · ")}
        </p>
      )}

      {topics.length > 0 && (
        <>
          <h3 className="mt-5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Stories per topic
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2 text-xs">
            {topics.map(([topic, n]) => (
              <li key={topic} className="rounded-full bg-muted px-3 py-1">
                {topic} <span className="font-semibold tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {run.coverage.length > 0 && (
        <>
          <h3 className="mt-5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Source coverage
          </h3>
          <ul className="mt-2 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {run.coverage.map((c) => (
              <li key={c.sourceId} className="flex items-center gap-2">
                {COVERAGE_ICON[c.status]}
                <span className="truncate">{c.name}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                  {c.status === "failed"
                    ? (c.message ?? "discovery failed")
                    : `${c.method === "sitemap" ? "Sitemap" : "Tavily"} · ${c.kept} kept · ${c.offTopic} off-topic · ${c.inWindow} in window`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {errors.length > 0 && (
        <p className="mt-5 flex gap-1.5 text-xs text-destructive">
          <CircleAlert aria-hidden className="mt-0.5 size-3 shrink-0" />
          Provider issues:{" "}
          {errors
            .map(([key, n]) => {
              const [provider, kind] = key.split(":");
              return `${n} ${PROVIDER_LABEL[provider ?? ""] ?? provider} ${ERROR_LABEL[kind ?? ""] ?? kind}`;
            })
            .join(", ")}
        </p>
      )}

      {run.warnings.length > 0 && (
        <ul className="mt-5 space-y-1.5 rounded-2xl bg-warning-soft px-4 py-3 text-xs text-warning">
          {run.warnings.map((w) => (
            <li key={w} className="flex gap-1.5">
              <TriangleAlert aria-hidden className="mt-0.5 size-3 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      )}

      {run.shortfallReasons.length > 0 && (
        <div className="mt-5 rounded-2xl border border-border px-4 py-3 text-xs">
          <p className="flex items-center gap-1.5 font-medium">
            <Info aria-hidden className="size-3.5" />
            Why fewer than {run.draftTarget} verified drafts
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
            {run.shortfallReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
