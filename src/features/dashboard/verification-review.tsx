"use client";

import { RotateCw } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { CandidateReport, EvidenceRecord, ResearchRun } from "@/features/research/types";
import { formatIst } from "./format";
import { CandidateStatusBadge, ClaimStatusBadge, SourceLink } from "./status";

const SOURCE_TYPE_LABEL: Record<EvidenceRecord["sourceType"], string> = {
  official_filing: "Exchange filing",
  official_company: "Company site",
  government_regulator: "Regulator / government",
  independent_news: "Independent news",
};

/** Not-processed stories that a retry would pick up (failed, interrupted or stopped by a limit). */
const retryable = (c: CandidateReport) =>
  c.status === "verification_failed" ||
  (c.status === "not_processed" && !c.statusReason.startsWith("Not in the top"));

/**
 * Step 5 output: draft queue (best evidence first) and every checked story in rank order.
 * Fetched text is untrusted and rendered as plain text.
 */
export function VerificationReview({
  run,
  onRetry,
  retrying,
}: {
  run: ResearchRun;
  /** Absent for read-only roles: no Retry button. */
  onRetry?: () => void;
  retrying: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const { candidates, draftQueue } = run;
  const checked = candidates.filter((c) => c.status !== "queued" && c.status !== "not_processed");
  const notProcessed = candidates.filter((c) => c.status === "not_processed").length;
  const toRetry = candidates.filter(retryable).length;
  if (checked.length === 0 && toRetry === 0) return null;
  const open = candidates.find((c) => c.id === openId) ?? null;
  const queuePosition = new Map(draftQueue.map((d, i) => [d.candidateId, i + 1]));

  return (
    <section
      id="verification"
      aria-labelledby="verification-heading"
      className="surface-raised scroll-mt-28 rounded-lg border border-border bg-card"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-4 sm:px-6 sm:py-5">
        <div>
          <h2
            id="verification-heading"
            className="font-display text-lg font-semibold tracking-tight"
          >
            Verification
          </h2>
          <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
            Claims checked against the responsible organisation&apos;s official source. Statuses
            come from application rules, not the AI. &ldquo;Unverified&rdquo; never means false.
            {notProcessed > 0 && ` ${notProcessed} stories were not processed.`}
          </p>
        </div>
        {toRetry > 0 && onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
            <RotateCw aria-hidden />
            Retry {toRetry} failed / unfinished
          </Button>
        )}
      </div>

      <div className="border-b border-border px-5 py-4 sm:px-6">
        <h3 className="text-sm font-semibold">
          Draft queue{" "}
          <span className="font-normal text-muted-foreground tabular-nums">
            {draftQueue.length} / {run.draftTarget}
          </span>
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Best-evidenced stories first. Verified stories, plus partially verified ones whose every
          high-materiality claim is verified. Drafting (Step 6) is not built yet; every draft needs
          human review.
        </p>
        {draftQueue.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-muted px-4 py-3 text-xs text-muted-foreground">
            No story is verified strongly enough to draft yet.
          </p>
        ) : (
          <ol className="mt-3 flex flex-col gap-1.5 text-sm">
            {draftQueue.map((d, i) => (
              <li key={d.candidateId} className="flex flex-wrap items-center gap-2">
                <span className="w-5 font-mono text-xs text-muted-foreground">{i + 1}.</span>
                <Badge variant="success">Score {d.verificationScore}</Badge>
                <Badge variant={d.readiness === "ready_for_review" ? "neutral" : "warning"}>
                  {d.readiness === "ready_for_review" ? "Ready for review" : "Needs recheck"}
                </Badge>
                <button
                  type="button"
                  onClick={() => setOpenId(d.candidateId)}
                  className="min-w-0 flex-1 truncate rounded text-left font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {d.headline}
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      <ul className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
        {checked.map((c) => (
          <li
            key={c.id}
            className="flex min-w-0 flex-col gap-2.5 rounded-2xl border border-border bg-background/40 p-4 text-sm"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono text-muted-foreground">#{c.rank}</span>
              <CandidateStatusBadge candidate={c} />
              {c.verificationScore !== null && (
                <Badge variant="outline">Evidence score {c.verificationScore}</Badge>
              )}
              {queuePosition.has(c.id) && (
                <Badge variant="success">Draft #{queuePosition.get(c.id)}</Badge>
              )}
              <span className="pill-raised rounded-full bg-muted px-3 py-1 font-medium">
                {c.publisher}
              </span>
            </div>
            <p className="line-clamp-3 leading-snug font-medium">{c.headline}</p>
            <p className="text-xs text-muted-foreground">{c.statusReason}</p>
            <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3 text-xs">
              <span className="text-muted-foreground tabular-nums">
                {c.claims.length} claim{c.claims.length === 1 ? "" : "s"} · {c.evidence.length}{" "}
                evidence
              </span>
              <Button variant="outline" size="sm" onClick={() => setOpenId(c.id)}>
                View details
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog
        open={open !== null}
        onClose={() => setOpenId(null)}
        title={open ? open.headline : ""}
        className="max-h-[85vh] max-w-3xl overflow-y-auto"
      >
        {open && <Details c={open} />}
      </Dialog>
    </section>
  );
}

function Details({ c }: { c: CandidateReport }) {
  const evidenceById = new Map(c.evidence.map((e) => [e.id, e]));
  return (
    <div className="space-y-5 text-xs text-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <CandidateStatusBadge candidate={c} />
        <SourceLink href={c.url}>{c.publisher} · original report</SourceLink>
      </div>
      <p className="text-muted-foreground">{c.statusReason}</p>
      {c.verificationScore !== null && (
        <div>
          <h3 className="text-sm font-semibold">Evidence score {c.verificationScore}</h3>
          <p className="mt-1 text-muted-foreground">
            {c.verificationScoreReasons.join(" · ") || "No supporting evidence."} ·{" "}
            {c.independentSources} independent publisher(s) after merging copies
          </p>
        </div>
      )}

      {c.claims.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Claims</h3>
          <ul className="mt-2 space-y-2">
            {c.claims.map((claim) => (
              <li key={claim.id} className="rounded-2xl bg-muted px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  {claim.materiality === "low" ? (
                    <Badge variant="outline">Not checked</Badge>
                  ) : (
                    <ClaimStatusBadge status={claim.status} />
                  )}
                  <span className="text-muted-foreground">
                    {claim.materiality} materiality · {claim.type.replace(/_/g, " ")}
                    {claim.stage !== "not_applicable" && ` · stage: ${claim.stage}`} · authority:{" "}
                    {claim.authority}
                  </span>
                </div>
                <p className="mt-1 font-medium">{claim.claim}</p>
                {claim.figures.length > 0 && (
                  <p className="mt-0.5 text-muted-foreground">
                    Figures: {claim.figures.join(" · ")}
                  </p>
                )}
                {claim.explanation && <p className="mt-1">{claim.explanation}</p>}
                {claim.gaps && <p className="mt-0.5 text-warning">Not confirmed: {claim.gaps}</p>}
                {claim.links.filter((l) => l.relation !== "does_not_establish").length > 0 && (
                  <ul className="mt-1.5 flex flex-col gap-0.5">
                    {claim.links
                      .filter((l) => l.relation !== "does_not_establish")
                      .map((l) => {
                        const e = evidenceById.get(l.evidenceId);
                        return e ? (
                          <li key={l.evidenceId} className="flex min-w-0 items-baseline gap-2">
                            <span
                              className={
                                l.relation === "supports"
                                  ? "shrink-0 text-success"
                                  : "shrink-0 text-warning"
                              }
                            >
                              {l.relation === "supports" ? "Supports" : "Contradicts"}
                            </span>
                            <SourceLink href={e.url}>{e.title || e.url}</SourceLink>
                          </li>
                        ) : null;
                      })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {c.officialSources.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Official source checks</h3>
          <ul className="mt-2 space-y-1">
            {c.officialSources.map((s) => (
              <li key={s.entity} className="flex flex-wrap items-baseline gap-2">
                <Badge variant={s.status === "validated" ? "success" : "neutral"}>{s.status}</Badge>
                <span className="font-medium">{s.entity}</span>
                {s.domain && <span className="font-mono">{s.domain}</span>}
                <span className="text-muted-foreground">{s.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {c.evidence.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Evidence</h3>
          <ul className="mt-2 space-y-2">
            {c.evidence.map((e) => (
              <li key={e.id} className="rounded-2xl border border-border px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={e.kind === "primary" ? "success" : "outline"}>
                    {e.kind === "primary" ? "Official" : "Secondary"}
                  </Badge>
                  <span>{SOURCE_TYPE_LABEL[e.sourceType]}</span>
                  {e.stale && <Badge variant="warning">Older than the story</Badge>}
                  <span className="text-muted-foreground">
                    {e.retrieval === "page" ? "page read" : "snippet only"} · {e.publisher} · source
                    date {e.publishedAt ? formatIst(e.publishedAt) : "unknown"} · retrieved{" "}
                    {formatIst(e.retrievedAt)}
                  </span>
                </div>
                <p className="mt-1 flex min-w-0">
                  <SourceLink href={e.url}>{e.title || e.url}</SourceLink>
                </p>
                {e.excerpt && <p className="mt-1 text-muted-foreground">{e.excerpt}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
