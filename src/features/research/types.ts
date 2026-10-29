/**
 * Contract between the research API and the dashboard. Client-safe: types and constants only.
 * A run is started with POST /api/research and polled with GET /api/research/[runId].
 */

export const DRAFT_TARGET = 10;
/** Drafts aimed for every run: verification continues, then the queue fills, to reach this. */
export const DRAFT_MIN = 5;

export type RunStage =
  "discovering" | "expanding" | "ranking" | "processing" | "drafting" | "completed" | "failed";

/** The pipeline step the server most recently started (for live step display). */
export type PipelineStep = "discover" | "rank" | "evidence" | "verify" | "draft";

export type CandidateStatus =
  | "queued"
  | "pending_evidence"
  | "verifying"
  | "verified"
  | "partially_verified"
  | "conflicting_evidence"
  | "unverified"
  | "verification_failed"
  | "irrelevant"
  | "not_processed";

/**
 * Decided by application code (the gate), never by the AI:
 * verified = official page/PDF of the responsible organisation supports it and contains every figure;
 * partially_verified = only secondary/snippet support, wrong organisation, or a figure not found;
 * conflicting_evidence = credible evidence contradicts it; unverified = nothing establishes it
 * (never means false); verification_failed = a provider failed or AI output was unusable.
 */
export type ClaimStatus =
  "verified" | "partially_verified" | "conflicting_evidence" | "unverified" | "verification_failed";
export type Materiality = "high" | "medium" | "low";

export type EvidenceKind = "primary" | "secondary";

export type EvidenceSourceType =
  "official_filing" | "official_company" | "government_regulator" | "independent_news";

export type EvidenceRecord = {
  id: string;
  /** primary = official source; secondary = independent news (never enough to verify). */
  kind: EvidenceKind;
  sourceType: EvidenceSourceType;
  /** Organisation the evidence is about/from (the claim's authority for official sources). */
  organisation: string;
  url: string;
  title: string;
  /** Hostname without www. */
  publisher: string;
  /** Tavily's estimate, when provided. */
  publishedAt: string | null;
  /** page = fetched page/PDF text; snippet = search snippet only. */
  retrieval: "page" | "snippet";
  retrievedAt: string;
  /** ≤300 chars of retrieved text (never generated). Full text stays on the server. */
  excerpt: string;
  /** Official source dated well before the story: it cannot confirm a new event. */
  stale?: boolean;
};

export type ClaimType =
  | "earnings"
  | "product_launch"
  | "partnership"
  | "acquisition"
  | "regulation"
  | "leadership_change"
  | "pricing"
  | "ipo"
  | "corporate_action"
  | "macro"
  | "market_movement"
  | "other";

export type DealStage =
  "proposed" | "announced" | "approved" | "completed" | "cancelled" | "not_applicable";

export type EvidenceRelation = "supports" | "contradicts" | "does_not_establish";

export type ClaimAssessment = {
  id: string;
  claim: string;
  type: ClaimType;
  status: ClaimStatus;
  materiality: Materiality;
  /** The one organisation that can confirm the claim. */
  authority: string;
  /** Numbers/dates as written in the story; all must appear in the official text to verify. */
  figures: string[];
  /** Deal stage the claim asserts (proposed … completed); checked against the official text. */
  stage: DealStage;
  links: { evidenceId: string; relation: EvidenceRelation }[];
  evidenceUrls: string[];
  explanation: string;
  gaps: string;
};

export type OfficialSourceCheck = {
  entity: string;
  domain: string | null;
  status: "validated" | "rejected" | "not_found";
  reason: string;
};

export type CandidateReport = {
  id: string;
  rank: number;
  headline: string;
  url: string;
  publisher: string;
  /** Tavily's publication-date estimate for the original report. */
  publishedAt: string | null;
  /** Other reports of the same story, each with its own title (figures may differ). */
  otherReports: { url: string; title: string; publisher: string; publishedAt: string | null }[];
  status: CandidateStatus;
  /** Why the gate reached this status (deterministic, from application code). */
  statusReason: string;
  primaryEvidenceFound: boolean;
  claims: ClaimAssessment[];
  claimCounts: Record<ClaimStatus, number>;
  evidence: EvidenceRecord[];
  evidenceSearchFailures: number;
  draftId: string | null;
  /** Step 4 rank score (rules, plus Gemini when screened). */
  score: number;
  /** Each score contribution, e.g. "recency +3 (2h old)". */
  rankReasons: string[];
  /** Union of the cluster's topics. */
  topics: string[];
  screenedBy: "rules" | "rules+gemini";
  /** Gemini screen: core fact is an official announcement (undefined when not screened). */
  verifiable?: boolean;
  /** Step 5: entities the story is about and the official domains checked for them. */
  entities: string[];
  officialSources: OfficialSourceCheck[];
  /** Distinct publishers among secondary evidence after merging copies of the same report. */
  independentSources: number;
  /** Evidence + claim strength (null until verified); decides the draft queue order. */
  verificationScore: number | null;
  verificationScoreReasons: string[];
};

/** A story chosen for drafting (Step 6), best evidence first; at most DRAFT_TARGET. */
export type DraftQueueItem = {
  candidateId: string;
  rank: number;
  headline: string;
  verificationScore: number;
  readiness: DraftReadiness;
  reason: string;
  /** Why drafting this story failed or was skipped (absent when drafted or not tried yet). */
  draftError?: string;
};

export type ExclusionReason =
  "timestamp_unverified" | "future_dated" | "out_of_window" | "not_an_article" | "irrelevant";

/** A discovered story dropped in Step 4, with why. Untrusted text: render as plain text. */
export type ExcludedItem = {
  url: string;
  title: string;
  publisher: string;
  reason: ExclusionReason;
  detail: string;
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
  verificationStatus: "verified" | "partially_verified";
  /** One of the 8 discovery topics. */
  category: string;
  tags: string[];
  /** Each verified claim the draft relies on → its official evidence URLs (from our records only). */
  claimEvidence: { claim: string; evidenceUrls: string[] }[];
  /** Material claims not verified (and gaps of verified ones): must not appear as fact. */
  missingEvidenceWarnings: string[];
  /** Deterministic checks run by application code; readiness depends on them. */
  checks: DraftCheck[];
  readiness: DraftReadiness;
  readinessReason: string;
  model: string;
  createdAt: string;
  researchedAt: string;
};

export type DraftCheck = {
  check: "figures" | "claim_ids" | "no_copying" | "no_advice" | "lengths";
  passed: boolean;
  note: string;
};

export type DiscoveryMethod = "sitemap" | "tavily";

/** A story found in Step 3 (discovery). Title and snippet are untrusted text: render as plain text. */
export type DiscoveredItem = {
  url: string;
  title: string;
  /** Sitemap keywords or Tavily excerpt; may be empty. */
  snippet: string;
  /** UTC ISO; null when the provider gave no parseable date (never estimated). */
  publishedAt: string | null;
  sourceId: string;
  publisher: string;
  method: DiscoveryMethod;
  topics: string[];
};

export type SourceCoverage = {
  sourceId: string;
  name: string;
  domain: string;
  status: "ok" | "no_results" | "failed";
  /** Method that produced the results (Tavily when a sitemap failed); null before it ran. */
  method: DiscoveryMethod | null;
  /** Items inside the 24h window (undated Tavily results included). */
  inWindow: number;
  /** Items dropped because no topic matched. */
  offTopic: number;
  /** Items kept (max per source applies). */
  kept: number;
  message?: string;
};

export type RunCounts = {
  resultsFound: number;
  excludedUndated: number;
  excludedStale: number;
  duplicatesRemoved: number;
  /** Candidates beyond each publisher's top RANK_CONFIG.perSourceCap (absent in older runs). */
  belowSourceCap?: number;
  uniqueCandidates: number;
  processed: number;
  verified: number;
  held: number;
  drafts: number;
  notProcessed: number;
  searchesUsed: number;
  aiCallsUsed: number;
  /** Step 5 page/PDF fetches through safe-fetch. */
  pagesAttempted: number;
  pagesFetched: number;
  pagesBlocked: number;
};

export type ResearchRun = {
  runId: string;
  /** Source ids chosen for this run; the discovery step reads them. */
  sourceIds: string[];
  /** Verification pass in progress, kept between step requests (budgets and time count from its start). */
  verifyPass?: {
    startedAt: string;
    searchesAtStart: number;
    aiCallsAtStart: number;
    /** Extra stories verified because fewer than DRAFT_MIN met the evidence bar. */
    extra: number;
    stopReason: string | null;
  };
  /** Drafting pass in progress, kept between step requests. */
  draftPass?: { startedAt: string; aiCallsAtStart: number; stopReason: string | null };
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
  /** Discovered stories on the 7 topics, newest first. */
  items: DiscoveredItem[];
  /** Kept items per topic name (an item can count under several topics). */
  topicCounts: Record<string, number>;
  /** Stories dropped while cleaning/ranking (Step 4). */
  excluded: ExcludedItem[];
  /** Step 5 output: best-evidenced stories to draft, at most DRAFT_TARGET. */
  draftQueue: DraftQueueItem[];
  counts: RunCounts;
  candidates: CandidateReport[];
  drafts: ResearchDraft[];
  warnings: string[];
  /** Provider failures by category, e.g. { "gemini:timeout": 2 }. */
  errorCounts: Record<string, number>;
  /** First failed page fetches as "reason: URL" (public URLs only; absent in older runs). */
  fetchFailures?: string[];
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

/** Source as shown on the dashboard (from DEFAULT_SOURCES). */
export type ConfiguredSource = {
  id: string;
  name: string;
  url: string;
  domain: string;
  enabled: boolean;
};
