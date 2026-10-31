"use client";

import { useState } from "react";
import { CircleCheck, CircleX, FileText, RotateCw, Send, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { DraftCheck, ResearchDraft } from "@/features/research/types";
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

const CHECK_LABEL: Record<DraftCheck["check"], string> = {
  figures: "Figures from verified claims only",
  claim_ids: "Claim ids valid",
  no_copying: "No copied sentences",
  no_advice: "No investment advice",
  lengths: "Field lengths",
};

type ArticleReviewProps = {
  drafts: readonly ResearchDraft[];
  /** True once a research run has finished (even with zero drafts). */
  hasRun: boolean;
  onPublish: (draft: ResearchDraft) => void;
  /** Queued stories without a draft (failed or not tried) and why. */
  pending: readonly { headline: string; reason: string }[];
  onRetryDrafts: () => void;
  busy: boolean;
};

/** Step 6 output: AI drafts from verified claims. Generated text is untrusted: plain text only. */
export function ArticleReview({
  drafts,
  hasRun,
  onPublish,
  pending,
  onRetryDrafts,
  busy,
}: ArticleReviewProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  // AI drafts always start as drafts; only a human editor could make one "ready" (Step 8).
  const countFor = (value: Filter) => (value === "all" || value === "draft" ? drafts.length : 0);
  const visible = countFor(filter) > 0 ? drafts : [];
  const open = drafts.find((d) => d.id === openId) ?? null;

  return (
    <section
      id="articles"
      aria-labelledby="articles-heading"
      className="scroll-mt-28 surface-raised rounded-lg border border-border bg-card"
    >
      <div className="border-b border-border px-5 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="articles-heading" className="font-display text-lg font-semibold tracking-tight">
              Research Results &amp; Articles
            </h2>
            <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
              AI drafts written only from verified claims and their official sources, then checked
              by rules. Every draft needs human review; nothing is published.
            </p>
          </div>
          {pending.length > 0 && hasRun && (
            <Button variant="outline" size="sm" onClick={onRetryDrafts} disabled={busy}>
              <RotateCw aria-hidden />
              Draft {pending.length} remaining
            </Button>
          )}
        </div>
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
        {pending.length > 0 && (
          <ul className="mt-4 space-y-1 rounded-2xl bg-muted px-4 py-3 text-xs text-muted-foreground">
            {pending.map((p) => (
              <li key={p.headline} className="flex gap-1.5">
                <TriangleAlert aria-hidden className="mt-0.5 size-3 shrink-0 text-warning" />
                <span>
                  <span className="font-medium text-foreground">{p.headline}</span> · {p.reason}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState filtered={filter !== "all"} hasRun={hasRun} />
      ) : (
        <ul className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
          {visible.map((draft) => (
            <DraftCard key={draft.id} draft={draft} onOpen={() => setOpenId(draft.id)} />
          ))}
        </ul>
      )}

      <Dialog
        open={open !== null}
        onClose={() => setOpenId(null)}
        title={open ? open.headline : ""}
        className="max-h-[85vh] max-w-3xl overflow-y-auto"
        actions={
          open ? (
            <>
              <Button variant="outline" onClick={() => setOpenId(null)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  setOpenId(null);
                  onPublish(open);
                }}
              >
                <Send aria-hidden />
                Publish
              </Button>
            </>
          ) : undefined
        }
      >
        {open && <DraftDetails draft={open} />}
      </Dialog>
    </section>
  );
}

function ReadinessBadge({ draft }: { draft: ResearchDraft }) {
  return draft.readiness === "ready_for_review" ? (
    <Badge variant="success">Ready for review</Badge>
  ) : (
    <Badge variant="warning">
      <TriangleAlert aria-hidden />
      Needs recheck
    </Badge>
  );
}

function DraftCard({ draft, onOpen }: { draft: ResearchDraft; onOpen: () => void }) {
  return (
    <li className="flex min-w-0 flex-col gap-2.5 rounded-2xl border border-border bg-background/40 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">AI draft</Badge>
        <ReadinessBadge draft={draft} />
        <Badge variant="neutral">
          {draft.verificationStatus === "verified" ? "Verified" : "Partially verified"}
        </Badge>
        <Badge variant="outline">{draft.category}</Badge>
      </div>
      <h3 className="line-clamp-3 leading-snug font-semibold">{draft.headline}</h3>
      <p className="line-clamp-3 text-xs text-muted-foreground">{draft.summary}</p>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3 text-xs">
        <span className="text-muted-foreground">
          {draft.publisher} · {formatIst(draft.sourcePublishedAt)}
        </span>
        <Button variant="outline" size="sm" onClick={onOpen}>
          View details
        </Button>
      </div>
    </li>
  );
}

function DraftDetails({ draft }: { draft: ResearchDraft }) {
  const official = new Set(draft.officialEvidenceUrls);
  return (
    <div className="space-y-5 text-xs text-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <ReadinessBadge draft={draft} />
        <Badge variant="neutral">
          {draft.verificationStatus === "verified" ? "Verified" : "Partially verified"}
        </Badge>
        <span className="text-muted-foreground">
          {draft.category} · model {draft.model} · created {formatIst(draft.createdAt)}
        </span>
      </div>
      <p
        className={cn(
          "rounded-2xl px-4 py-3",
          draft.readiness === "ready_for_review"
            ? "bg-muted text-muted-foreground"
            : "bg-warning-soft text-warning",
        )}
      >
        {draft.readinessReason}
      </p>

      <div>
        <p className="text-sm font-medium">{draft.summary}</p>
        <div className="mt-3 max-w-prose text-sm whitespace-pre-line">{draft.body}</div>
      </div>

      <dl className="grid gap-2 sm:grid-cols-[8rem_1fr]">
        <dt className="text-muted-foreground">SEO title</dt>
        <dd>{draft.seoTitle}</dd>
        <dt className="text-muted-foreground">SEO description</dt>
        <dd>{draft.seoDescription}</dd>
        <dt className="text-muted-foreground">Tags</dt>
        <dd className="flex flex-wrap gap-1">
          {draft.tags.map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
        </dd>
      </dl>

      <div>
        <h3 className="text-sm font-semibold">Checks</h3>
        <ul className="mt-2 space-y-1">
          {draft.checks.map((c) => (
            <li key={c.check} className="flex items-start gap-1.5">
              {c.passed ? (
                <CircleCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />
              ) : (
                <CircleX aria-hidden className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              )}
              <span>
                {CHECK_LABEL[c.check]}
                {c.note && <span className="text-muted-foreground"> · {c.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Claims and evidence</h3>
        <ul className="mt-2 space-y-2">
          {draft.claimEvidence.map((c) => (
            <li key={c.claim} className="rounded-2xl bg-muted px-4 py-3">
              <p className="font-medium">{c.claim}</p>
              {c.evidenceUrls.map((url) => (
                <p key={url} className="mt-1 flex min-w-0 items-baseline gap-2">
                  <span
                    className={
                      official.has(url) ? "shrink-0 text-success" : "shrink-0 text-muted-foreground"
                    }
                  >
                    {official.has(url) ? "Official" : "Secondary"}
                  </span>
                  <SourceLink href={url}>{url}</SourceLink>
                </p>
              ))}
            </li>
          ))}
        </ul>
        {draft.secondaryEvidenceUrls.length > 0 && (
          <ul className="mt-2 space-y-1">
            {draft.secondaryEvidenceUrls.map((url) => (
              <li key={url} className="flex min-w-0 items-baseline gap-2">
                <span className="shrink-0 text-muted-foreground">Secondary</span>
                <SourceLink href={url}>{url}</SourceLink>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 font-medium">Original · {draft.publisher}</span>
          <SourceLink href={draft.originalUrl}>{draft.originalUrl}</SourceLink>
        </p>
      </div>

      {draft.missingEvidenceWarnings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-warning">
            Not confirmed (must not appear as fact)
          </h3>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted-foreground">
            {draft.missingEvidenceWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function EmptyState({ filtered, hasRun }: { filtered: boolean; hasRun: boolean }) {
  const [title, text] = filtered
    ? ["No articles in this view", "Articles with this status will appear here."]
    : hasRun
      ? [
          "No drafts",
          "No story was verified strongly enough to draft, or drafting failed. See Internal research details for the verification evidence and run summary.",
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
