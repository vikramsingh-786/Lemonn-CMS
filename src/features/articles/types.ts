import type { CandidateReport, DraftCheck, ResearchDraft } from "@/features/research/types";

/** draft → ready (approved, checks pass) or rejected. Publishing is not connected yet. */
export type ArticleStatus = "draft" | "ready" | "rejected";

/** The fields an editor writes. `body` is the Markdown subset rendered by ArticleBody. */
export type ArticleFields = {
  headline: string;
  summary: string;
  body: string;
  seoTitle: string;
  seoDescription: string;
  category: string;
  tags: string[];
};

export type Article = ArticleFields & {
  id: string;
  runId: string;
  candidateId: string;
  status: ArticleStatus;
  /** Deterministic checks from the last save (figures, copying, advice, lengths). */
  checks: DraftCheck[];
  version: number;
  createdAt: string;
  updatedAt: string;
  /** Name of the account that saved it last (null before accounts existed). */
  updatedByName: string | null;
};

export type ArticleSummary = Pick<
  Article,
  | "id"
  | "runId"
  | "candidateId"
  | "status"
  | "headline"
  | "category"
  | "updatedAt"
  | "updatedByName"
>;

/** What the editor shows beside the text: the AI draft it came from and the story's evidence. */
export type ArticleContext = {
  draft: ResearchDraft;
  story: Pick<
    CandidateReport,
    "headline" | "url" | "publisher" | "publishedAt" | "claims" | "evidence"
  >;
  /** Topic names a category may take. */
  categories: string[];
};

/** PATCH /api/articles/[id] body. */
export type ArticleSaveRequest = ArticleFields & {
  /** The version the editor started from; a mismatch means another tab saved first (409). */
  version: number;
  status?: ArticleStatus;
  /** Required to mark a partially verified story ready: the editor checked those claims. */
  confirmPartial?: boolean;
};

/** Checks that block "ready": facts and compliance. Lengths are editorial advice only. */
export const BLOCKING_CHECKS: readonly DraftCheck["check"][] = [
  "figures",
  "no_copying",
  "no_advice",
];

export const STATUS_LABEL: Record<ArticleStatus, string> = {
  draft: "In editing",
  ready: "Ready to publish",
  rejected: "Rejected",
};
