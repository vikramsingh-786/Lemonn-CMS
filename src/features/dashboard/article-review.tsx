"use client";

import { useState } from "react";
import { FileText, Send, ShieldCheck, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ResearchDraft } from "@/features/research/types";
import { cn } from "@/lib/utils";
import { formatIst } from "./format";
import { SourceLink } from "./status";

type Filter = "all" | "draft" | "ready" | "published";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "ready", label: "Ready to Publish" },
  { value: "published", label: "Published" },
];

type ArticleReviewProps = {
  drafts: readonly ResearchDraft[];
  /** True once a research run has finished (even with zero drafts). */
  hasRun: boolean;
  onPublish: (draft: ResearchDraft) => void;
};

export function ArticleReview({ drafts, hasRun, onPublish }: ArticleReviewProps) {
  const [filter, setFilter] = useState<Filter>("all");
  // AI drafts always start as drafts; only a human editor could make one "ready" (not built yet).
  const countFor = (value: Filter) => (value === "all" || value === "draft" ? drafts.length : 0);
  const visible = countFor(filter) > 0 ? drafts : [];

  return (
    <section
      id="articles"
      aria-labelledby="articles-heading"
      className="scroll-mt-28 surface-raised rounded-lg border border-border bg-card"
    >
      <div className="border-b border-border px-5 py-4 sm:px-6 sm:py-5">
        <h2 id="articles-heading" className="font-display text-lg font-semibold tracking-tight">
          Research Results &amp; Articles
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Drafts are written only for stories that passed verification, and still need human review.
          Results are kept in server memory and disappear on restart.
        </p>
        <div role="group" aria-label="Filter articles" className="mt-5 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "pill-raised inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                filter === f.value
                  ? "border-transparent bg-foreground text-background"
                  : "border-transparent bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
              <span className="tabular-nums opacity-70">{countFor(f.value)}</span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState filtered={filter !== "all"} hasRun={hasRun} />
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((draft) => (
            <DraftCard key={draft.id} draft={draft} onPublish={onPublish} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DraftCard({
  draft,
  onPublish,
}: {
  draft: ResearchDraft;
  onPublish: (d: ResearchDraft) => void;
}) {
  const ready = draft.readiness === "ready_for_review";
  return (
    <li className="px-5 py-4 sm:px-6 sm:py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">AI draft</Badge>
            <Badge variant="success">
              <ShieldCheck aria-hidden />
              Verified
            </Badge>
            {ready ? (
              <Badge variant="neutral">Awaiting editorial review</Badge>
            ) : (
              <Badge variant="warning">
                <TriangleAlert aria-hidden />
                Needs evidence recheck
              </Badge>
            )}
          </div>
          <h3 className="mt-2 text-base font-semibold">{draft.headline}</h3>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">{draft.summary}</p>
        </div>
        <Button size="sm" className="self-start" onClick={() => onPublish(draft)}>
          <Send aria-hidden />
          Publish
        </Button>
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <div className="flex gap-1">
          <dt>Source date:</dt>
          <dd>{formatIst(draft.sourcePublishedAt)}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Researched:</dt>
          <dd>{formatIst(draft.researchedAt)}</dd>
        </div>
      </dl>

      <ul className="mt-3 flex flex-col gap-1 text-xs">
        <li className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 font-medium">Original · {draft.publisher}</span>
          <SourceLink href={draft.originalUrl}>{draft.originalUrl}</SourceLink>
        </li>
        {draft.officialEvidenceUrls.map((url) => (
          <li key={url} className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 font-medium text-success">Official</span>
            <SourceLink href={url}>{url}</SourceLink>
          </li>
        ))}
        {draft.secondaryEvidenceUrls.map((url) => (
          <li key={url} className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 text-muted-foreground">Corroboration</span>
            <SourceLink href={url}>{url}</SourceLink>
          </li>
        ))}
      </ul>

      <p
        className={cn(
          "mt-4 rounded-2xl px-4 py-3 text-xs",
          ready ? "bg-muted text-muted-foreground" : "bg-warning-soft text-warning",
        )}
      >
        {draft.readinessReason}
      </p>

      <details className="mt-3 text-sm">
        <summary className="rounded text-xs font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          Read draft, SEO fields and claim-to-evidence mapping
        </summary>
        <div className="mt-3 space-y-4">
          <div className="max-w-prose whitespace-pre-line">{draft.body}</div>
          <dl className="grid gap-2 text-xs sm:grid-cols-[8rem_1fr]">
            <dt className="text-muted-foreground">SEO title</dt>
            <dd>{draft.seoTitle}</dd>
            <dt className="text-muted-foreground">SEO description</dt>
            <dd>{draft.seoDescription}</dd>
          </dl>
          <div className="text-xs">
            <p className="font-medium">Verified claims used</p>
            <ul className="mt-1 space-y-1.5">
              {draft.claimEvidence.map((c) => (
                <li key={c.claim}>
                  <p>{c.claim}</p>
                  {c.evidenceUrls.map((url) => (
                    <p key={url} className="flex min-w-0 pl-3">
                      <SourceLink href={url}>{url}</SourceLink>
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>
    </li>
  );
}

function EmptyState({ filtered, hasRun }: { filtered: boolean; hasRun: boolean }) {
  const [title, text] = filtered
    ? ["No articles in this view", "Articles with this status will appear here."]
    : hasRun
      ? [
          "No verified drafts",
          "No story passed verification in the last run. See the run summary and the Verification list for reasons.",
        ]
      : [
          "No research results yet",
          "Run Research News to discover, verify and draft stories from your enabled sources.",
        ];
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <FileText aria-hidden className="size-5" />
      </span>
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
