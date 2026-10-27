import type { CandidateReport } from "@/features/research/types";
import { formatIst } from "./format";
import { CandidateStatusBadge, ClaimStatusBadge, SourceLink } from "./status";

/** Every discovered story with its verification outcome — including held ones, for editors. */
export function CandidateReview({ candidates }: { candidates: readonly CandidateReport[] }) {
  if (candidates.length === 0) return null;
  return (
    <section
      id="verification"
      aria-labelledby="candidates-heading"
      className="surface-raised scroll-mt-28 rounded-lg border border-border bg-card"
    >
      <div className="border-b border-border px-5 py-4 sm:px-6 sm:py-5">
        <h2 id="candidates-heading" className="font-display text-lg font-semibold tracking-tight">
          Verification
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Every unique story found, in rank order. Only <strong>Verified</strong> stories are
          drafted; the status comes from application rules, not the AI&apos;s own label.
        </p>
      </div>
      <ol className="divide-y divide-border">
        {candidates.map((c) => (
          <li key={c.id} className="px-5 py-4 sm:px-6 sm:py-5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">#{c.rank}</span>
              <CandidateStatusBadge status={c.status} />
              {c.primaryEvidenceFound && (
                <span className="text-xs text-success">Official source found</span>
              )}
            </div>
            <p className="mt-1.5 font-medium">{c.headline}</p>
            <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs">
              <span>{c.publisher}</span>
              <span className="text-muted-foreground">{formatIst(c.publishedAt)}</span>
              <SourceLink href={c.url}>Original report</SourceLink>
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">{c.statusReason}</p>

            {(c.claims.length > 0 || c.evidence.length > 0) && (
              <details className="mt-2 text-xs">
                <summary className="rounded font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  {c.claims.length} claim(s) · {c.evidence.length} evidence item(s)
                  {c.evidenceSearchFailures > 0 &&
                    ` · ${c.evidenceSearchFailures} evidence search(es) failed`}
                </summary>
                <ul className="mt-2 space-y-2">
                  {c.claims.map((claim, i) => (
                    <li key={i} className="rounded-2xl bg-muted px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <ClaimStatusBadge status={claim.status} />
                        <span className="text-muted-foreground">
                          {claim.materiality} materiality
                        </span>
                      </div>
                      <p className="mt-1 font-medium">{claim.claim}</p>
                      <p className="mt-0.5 text-muted-foreground">{claim.explanation}</p>
                      {claim.gaps && <p className="mt-0.5 text-warning">Gap: {claim.gaps}</p>}
                      {claim.evidenceUrls.length > 0 && (
                        <ul className="mt-1 flex flex-col gap-0.5">
                          {claim.evidenceUrls.map((url) => (
                            <li key={url} className="flex min-w-0">
                              <SourceLink href={url}>{url}</SourceLink>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
                {c.evidence.length > 0 && (
                  <>
                    <p className="mt-3 font-medium">Evidence retrieved</p>
                    <ul className="mt-1 flex flex-col gap-1">
                      {c.evidence.map((e) => (
                        <li key={e.id} className="flex min-w-0 items-baseline gap-2">
                          <span
                            className={
                              e.kind === "primary"
                                ? "shrink-0 font-medium text-success"
                                : "shrink-0 text-muted-foreground"
                            }
                          >
                            {e.kind === "primary" ? "Official" : "Secondary"}
                          </span>
                          <span className="shrink-0">{e.publisher}</span>
                          <SourceLink href={e.url}>{e.title}</SourceLink>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </details>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
