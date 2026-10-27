import { Badge } from "@/components/ui/badge";
import type { CandidateStatus, ClaimStatus } from "@/features/research/types";

type Variant = "success" | "warning" | "neutral" | "outline";

const CANDIDATE: Record<CandidateStatus, [string, Variant]> = {
  queued: ["Queued", "outline"],
  pending_evidence: ["Finding evidence", "outline"],
  verifying: ["Verifying", "outline"],
  verified: ["Verified", "success"],
  partially_verified: ["Partially verified", "warning"],
  unverified: ["Unverified", "neutral"],
  contradicted: ["Contradicted", "warning"],
  verification_failed: ["Verification failed", "neutral"],
  irrelevant: ["Not relevant", "neutral"],
  not_processed: ["Not processed", "outline"],
};

const CLAIM: Record<ClaimStatus, [string, Variant]> = {
  supported: ["Supported", "success"],
  partially_supported: ["Partially supported", "warning"],
  contradicted: ["Contradicted", "warning"],
  unresolved: ["Unresolved", "neutral"],
};

export function CandidateStatusBadge({ status }: { status: CandidateStatus }) {
  const [label, variant] = CANDIDATE[status];
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
