/**
 * Contract between the research API and the dashboard. Client-safe: types and constants only.
 * A run is started with POST /api/research and polled with GET /api/research/[runId].
 */

export const DRAFT_TARGET = 10;

export type RunStage = "discovering" | "expanding" | "processing" | "completed" | "failed";

/** The pipeline step the server most recently started (for live step display). */
export type PipelineStep = "discover" | "evidence" | "verify" | "draft";

export type CandidateStatus =
  | "queued"
  | "pending_evidence"
  | "verifying"
  | "verified"
  | "partially_verified"
  | "unverified"
  | "contradicted"
  | "verification_failed"
  | "irrelevant"
  | "not_processed";

export type ClaimStatus = "supported" | "partially_supported" | "contradicted" | "unresolved";
export type Materiality = "high" | "medium" | "low";

export type EvidenceKind = "primary" | "secondary";

export type EvidenceRecord = {
  id: string;
  kind: EvidenceKind;
  url: string;
  title: string;
  /** Hostname without www. */
  publisher: string;
  /** Tavily's estimate, when provided. */
  publishedAt: string | null;
  /** Short excerpt of retrieved text (from Tavily; never generated). */
  excerpt: string;
};

export type ClaimAssessment = {
  claim: string;
  status: ClaimStatus;
  materiality: Materiality;
  evidenceUrls: string[];
  explanation: string;
  gaps: string;
};

export type CandidateReport = {
  id: string;
  rank: number;
  headline: string;
  url: string;
  publisher: string;
  /** Tavily's publication-date estimate for the original report. */
  publishedAt: string | null;
  otherReports: { url: string; title: string; publisher: string }[];
  status: CandidateStatus;
  /** Why the gate reached this status (deterministic, from application code). */
  statusReason: string;
  primaryEvidenceFound: boolean;
  claims: ClaimAssessment[];
  claimCounts: Record<ClaimStatus, number>;
  evidence: EvidenceRecord[];
  evidenceSearchFailures: number;
  draftId: string | null;
};

export type DraftReadiness = "ready_for_review" | "needs_recheck";

export type ResearchDraft = {
  id: string;
  candidateId: string;
  headline: string;
  summary: string;
  body: string;
  seoTitle: string;
  seoDescription: string;
  originalUrl: string;
  publisher: string;
  /** Tavily's estimate for the original report. */
  sourcePublishedAt: string | null;
  officialEvidenceUrls: string[];
  secondaryEvidenceUrls: string[];
  verificationStatus: "verified";
  claimEvidence: { claim: string; evidenceUrls: string[] }[];
  readiness: DraftReadiness;
  readinessReason: string;
  researchedAt: string;
};

export type SourceCoverage = {
  sourceId: string;
  name: string;
  domain: string;
  status: "ok" | "no_results" | "failed";
  resultCount: number;
  eligibleCount: number;
  message?: string;
};

export type RunCounts = {
  resultsFound: number;
  excludedUndated: number;
  excludedStale: number;
  duplicatesRemoved: number;
  uniqueCandidates: number;
  processed: number;
  verified: number;
  held: number;
  drafts: number;
  notProcessed: number;
  searchesUsed: number;
  aiCallsUsed: number;
};

export type ResearchRun = {
  runId: string;
  window: { start: string; end: string };
  stage: RunStage;
  /** Step currently being worked on; null when the run has finished. */
  currentStep: PipelineStep | null;
  /** Human-readable current activity, e.g. "Verifying 3 of 12". */
  stageDetail: string;
  startedAt: string;
  finishedAt: string | null;
  draftTarget: number;
  coverage: SourceCoverage[];
  counts: RunCounts;
  candidates: CandidateReport[];
  drafts: ResearchDraft[];
  warnings: string[];
  /** Provider failures by category, e.g. { "gemini:timeout": 2 }. */
  errorCounts: Record<string, number>;
  timings: { stage: string; ms: number }[];
  /** Why fewer than DRAFT_TARGET drafts were produced (empty when the target was met). */
  shortfallReasons: string[];
  error: { code: ResearchErrorCode; message: string } | null;
};

export type ResearchErrorCode =
  | "invalid_request"
  | "not_configured"
  | "busy"
  | "not_found"
  | "provider_auth"
  | "provider_quota"
  | "provider_rate_limited"
  | "provider_timeout"
  | "provider_unavailable"
  | "ai_invalid_output"
  | "internal_error";

export type ApiErrorBody = {
  error: {
    code: ResearchErrorCode | "source_limit" | "invalid_source" | "duplicate_source";
    message: string;
    retryable: boolean;
  };
};

export type StartRunResponse = { runId: string };

/** Step-1 response: the request is valid; nothing has been researched yet. */
export type ResearchRequestAccepted = {
  accepted: true;
  window: { start: string; end: string };
  sources: { id: string; name: string; domain: string }[];
};

/** Source as exposed by /api/sources. */
export type ConfiguredSource = {
  id: string;
  name: string;
  url: string;
  domain: string;
  isPrimarySource: boolean;
  enabled: boolean;
};
