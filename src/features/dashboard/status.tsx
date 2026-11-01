import { Badge } from "@/components/ui/badge";
import type { CandidateReport, CandidateStatus, ClaimStatus } from "@/features/research/types";

type Variant = "success" | "warning" | "neutral" | "outline";

const CANDIDATE: Record<CandidateStatus, [string, Variant]> = {
  queued: ["Queued", "outline"],
  pending_evidence: ["Finding evidence", "outline"],
  verifying: ["Verifying", "outline"],
  verified: ["Verified", "success"],
  partially_verified: ["Partially verified", "warning"],
  unverified: ["Unverified", "neutral"],
  conflicting_evidence: ["Conflicting evidence", "warning"],
  verification_failed: ["Verification failed", "neutral"],
  irrelevant: ["Not relevant", "neutral"],
  not_processed: ["Not processed", "outline"],
};

const CLAIM: Record<ClaimStatus, [string, Variant]> = {
  verified: ["Verified", "success"],
  partially_verified: ["Partially verified", "warning"],
  conflicting_evidence: ["Conflicting evidence", "warning"],
  unverified: ["Unverified", "neutral"],
  verification_failed: ["Verification failed", "neutral"],
};

/**
 * Partially verified, but every high-importance claim is verified (the story's core news is
 * confirmed by the official source; only supporting details are not). Same rule as the draft
 * queue's evidence bar.
 */
export function coreVerified(c: Pick<CandidateReport, "status" | "claims">): boolean {
  const high = c.claims.filter((a) => a.materiality === "high");
  return (
    c.status === "partially_verified" &&
    high.length > 0 &&
    high.every((a) => a.status === "verified")
  );
}

export function CandidateStatusBadge({
  candidate,
}: {
  candidate: Pick<CandidateReport, "status" | "claims">;
}) {
  if (coreVerified(candidate)) return <Badge variant="success">Core verified</Badge>;
  const [label, variant] = CANDIDATE[candidate.status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function ClaimStatusBadge({ status }: { status: ClaimStatus }) {
  const [label, variant] = CLAIM[status];
  return <Badge variant={variant}>{label}</Badge>;
}

/** External link with consistent styling and a screen-reader hint. */
export function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-w-0 items-center gap-1 rounded text-muted-foreground hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="truncate">{children}</span>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
