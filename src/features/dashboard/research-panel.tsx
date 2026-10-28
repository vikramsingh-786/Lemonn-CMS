import {
  ArrowUpRight,
  Check,
  ListOrdered,
  CircleAlert,
  CircleCheck,
  FileText,
  LoaderCircle,
  RotateCw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PipelineStep, ResearchRun } from "@/features/research/types";
import { MAX_SOURCES } from "@/features/sources/validation";
import { cn } from "@/lib/utils";
import type { ResearchStatus } from "./data";

type StepState = "idle" | "active" | "done";

const STEPS = [
  { key: "discover", label: "Discover", detail: "News sitemaps + Tavily, last 24h", icon: Search },
  { key: "rank", label: "Rank", detail: "Clean, de-duplicate, score", icon: ListOrdered },
  { key: "evidence", label: "Evidence", detail: "Official + independent sources", icon: FileText },
  { key: "verify", label: "Verify", detail: "Gemini claims + rules gate", icon: ShieldCheck },
  { key: "draft", label: "Draft", detail: "Verified stories only", icon: Sparkles },
] as const satisfies readonly { key: PipelineStep; [k: string]: unknown }[];

/** Steps the server has built so far (all five). */
const BUILT_STEPS = 5;

/**
 * Step states from the server's real current step (no invented progress). Evidence and Verify
 * run together per story, so both are active while verifying.
 */
export function stepStates(status: ResearchStatus, run: ResearchRun | null): StepState[] {
  if (status === "done") return STEPS.map((_, i) => (i < BUILT_STEPS ? "done" : "idle"));
  if (status !== "running") return STEPS.map(() => "idle");
  const step = run?.currentStep ?? "discover";
  const current = STEPS.findIndex((s) => s.key === (step === "verify" ? "evidence" : step));
  const last = step === "verify" ? current + 1 : current;
  return STEPS.map((_, i) => (i < current ? "done" : i <= last ? "active" : "idle"));
}

/** Live counts under Discover and Rank once there is data; later steps aren't built yet. */
function stepDetail(key: PipelineStep, fallback: string, run: ResearchRun | null): string {
  if (!run) return fallback;
  if (key === "discover") {
    return run.stage === "discovering"
      ? run.stageDetail
      : `${run.counts.resultsFound} in window · ${run.items.length} on topic`;
  }
  if (key === "rank") {
    if (run.stage === "discovering") return fallback;
    return run.stage === "ranking"
      ? run.stageDetail
      : `${run.candidates.length} candidates · ${run.excluded.length} excluded`;
  }
  if (key === "evidence" || key === "verify") {
    if (run.stage !== "processing" && run.counts.processed === 0) {
      return run.stage === "completed" ? "Skipped (see warnings)" : fallback;
    }
    if (run.stage === "processing") return run.stageDetail;
    return key === "evidence"
      ? `${run.counts.pagesFetched} official pages read`
      : `${run.counts.verified} verified · ${run.counts.held} held`;
  }
  if (run.stage === "drafting") return run.stageDetail;
  if (run.stage !== "completed" && run.drafts.length === 0) return fallback;
  return `${run.drafts.length} of ${run.draftQueue.length} queued drafted (max ${run.draftTarget})`;
}

type ResearchPanelProps = {
  status: ResearchStatus;
  run: ResearchRun | null;
  error: string | null;
  enabledSources: number;
  totalSources: number;
  onResearch: () => void;
};

/** Right-hand control panel: what will be searched, live pipeline state, and the action. */
export function ResearchPanel({
  status,
  run,
  error,
  enabledSources,
  totalSources,
  onResearch,
}: ResearchPanelProps) {
  const states = stepStates(status, run);
  const running = status === "running";

  return (
    <section
      aria-labelledby="panel-heading"
      className="surface-raised rounded-lg border border-border bg-card px-5 py-5"
    >
      <h2
        id="panel-heading"
        className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase"
      >
        Research
      </h2>

      <p className="mt-3 text-sm text-muted-foreground">Sources enabled</p>
      <p className="mt-1 flex items-baseline gap-2 font-display text-4xl font-semibold tracking-tight tabular-nums">
        <span className="border-l-2 border-primary pl-3">{enabledSources}</span>
        <span className="text-xl text-muted-foreground">
          / {Math.min(totalSources, MAX_SOURCES)}
        </span>
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Window: rolling last 24 hours (UTC) · max {MAX_SOURCES} sources
      </p>

      <ol className="mt-4 flex flex-col gap-1.5">
        {STEPS.map(({ key, label, detail, icon: Icon }, i) => {
          const state = states[i]!;
          return (
            <li
              key={label}
              className={cn(
                "pill-raised flex items-center gap-2.5 rounded-full bg-muted py-1.5 pr-4 pl-1.5 transition-colors",
                state === "idle" && "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full",
                  state === "done"
                    ? "bg-success-soft text-success"
                    : state === "active"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background/60",
                )}
              >
                {state === "done" ? (
                  <Check aria-hidden className="size-4" />
                ) : state === "active" ? (
                  <LoaderCircle aria-hidden className="size-4 animate-spin" />
                ) : (
                  <Icon aria-hidden className="size-4" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{label}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {stepDetail(key, detail, run)}
                </span>
              </span>
              <span className="sr-only">
                {state === "done" ? "complete" : state === "active" ? "in progress" : "not started"}
              </span>
            </li>
          );
        })}
      </ol>

      <div role="status" aria-live="polite">
        {running && (
          <p className="mt-5 flex items-start gap-2.5 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
            <LoaderCircle aria-hidden className="mt-0.5 size-4 shrink-0 animate-spin" />
            <span>
              {run ? run.stageDetail : "Starting research…"}. A full run can take several minutes.
            </span>
          </p>
        )}
        {status === "done" && run && (
          <p className="mt-5 flex items-start gap-2.5 rounded-2xl bg-success-soft px-4 py-3 text-sm text-success">
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              Ranked {run.candidates.length}{" "}
              {run.candidates.length === 1 ? "candidate" : "candidates"}; {run.counts.verified} of{" "}
              {run.counts.processed} checked {run.counts.processed === 1 ? "story" : "stories"}{" "}
              fully verified; {run.drafts.length} draft{run.drafts.length === 1 ? "" : "s"} written
              for human review.
            </span>
          </p>
        )}
      </div>
      {status === "error" && error && (
        <div
          role="alert"
          className="mt-5 flex flex-col gap-3 rounded-2xl bg-muted px-4 py-3 text-sm"
        >
          <p className="flex items-start gap-2.5 text-destructive">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={onResearch}
            disabled={enabledSources === 0}
          >
            <RotateCw aria-hidden />
            Retry
          </Button>
        </div>
      )}
    </section>
  );
}

/** Compact feed of the top-ranked candidates; links into Discovered stories. */
export function ResearchFeed({ run }: { run: ResearchRun | null }) {
  const items = (run?.candidates ?? []).slice(0, 5);
  return (
    <section
      aria-labelledby="feed-heading"
      className="surface-raised rounded-lg border border-border bg-card px-5 py-5"
    >
      <h2 id="feed-heading" className="font-display text-lg font-semibold tracking-tight">
        Live Research Feed
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Latest stories from this run and where they stand.
      </p>
      {items.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
          Stories appear here as research runs.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href="#discovered"
                className="pill-raised flex items-center gap-3 rounded-full bg-muted py-2 pr-2 pl-4 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    #{item.rank} {item.headline}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {item.publisher} · {item.topics.join(", ")}
                  </span>
                </span>
                <span className="sr-only">, view details</span>
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-card">
                  <ArrowUpRight aria-hidden className="size-4" />
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
