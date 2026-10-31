import "server-only";
import { z } from "zod";
import { runDraftChecks } from "@/features/research/draft-checks";
import { getRun, isRunId, loadEvidence } from "@/features/research/run-store";
import { TOPICS } from "@/features/research/topics";
import type { DraftCheck, ResearchRun } from "@/features/research/types";
import type { Article as ArticleRow } from "@/generated/prisma/client";

type Row = ArticleRow & { updatedBy: { name: string } | null };
const WITH_EDITOR = { updatedBy: { select: { name: true } } } as const;
import { db } from "@/lib/db";
import {
  BLOCKING_CHECKS,
  type Article,
  type ArticleContext,
  type ArticleFields,
  type ArticleStatus,
  type ArticleSummary,
} from "./types";

const CATEGORIES = TOPICS.map((t) => t.name);
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Hard limits (abuse guards); the editorial limits are soft and reported by the length check. */
export const saveSchema = z
  .object({
    version: z.number().int().min(1),
    headline: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(1000),
    body: z.string().trim().min(1).max(20_000),
    seoTitle: z.string().trim().min(1).max(120),
    seoDescription: z.string().trim().min(1).max(320),
    category: z.string().refine((c) => CATEGORIES.includes(c), "Unknown category"),
    tags: z.array(z.string().trim().min(1).max(40)).max(10),
    status: z.enum(["draft", "ready", "rejected"]).optional(),
    confirmPartial: z.boolean().optional(),
  })
  .strict();

function toArticle(row: Row): Article {
  return {
    id: row.id,
    runId: row.runId,
    candidateId: row.candidateId,
    status: row.status as ArticleStatus,
    headline: row.headline,
    summary: row.summary,
    body: row.body,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    category: row.category,
    tags: row.tags,
    checks: row.checks as unknown as DraftCheck[],
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: row.updatedBy?.name ?? null,
  };
}

/**
 * The same deterministic checks the drafter ran, on the editor's text: every number must come
 * from the story's verified or partially verified claims or their evidence, no 12-word copies of
 * the evidence or original headline, no advice language, and the editorial lengths.
 */
export async function checkArticle(
  run: ResearchRun,
  candidateId: string,
  fields: ArticleFields,
): Promise<DraftCheck[]> {
  const story = run.candidates.find((c) => c.id === candidateId);
  if (!story) return [];
  const passages = await loadEvidence(run.runId);
  const evidence = new Map(story.evidence.map((e) => [e.id, e]));
  const claims = story.claims.filter(
    (a) =>
      a.materiality !== "low" && (a.status === "verified" || a.status === "partially_verified"),
  );
  const texts = [
    ...new Set(
      claims.flatMap((a) =>
        a.links.filter((l) => l.relation === "supports").map((l) => l.evidenceId),
      ),
    ),
  ].map((id) => passages[id]?.text ?? evidence.get(id)?.excerpt ?? evidence.get(id)?.title ?? "");
  return runDraftChecks(
    { ...fields, claimIdsUsed: ["edit"] },
    {
      allowedText: [...claims.flatMap((a) => [a.claim, ...a.figures]), ...texts].join("\n"),
      givenIds: ["edit"],
      copySources: [...texts, story.headline, ...story.otherReports.map((r) => r.title)],
    },
  ).filter((c) => c.check !== "claim_ids"); // the editor writes freely; claim ids are the AI's
}

/** The article for a draft, created from the AI draft on first use. Null when there's no draft. */
export async function articleForDraft(
  runId: string,
  candidateId: string,
  userId: string,
): Promise<Article | null> {
  if (!isRunId(runId)) return null;
  const existing = await db().researchRun.findFirst({ where: { id: runId }, select: { id: true } });
  if (!existing) return null;
  const found = await db().article.findUnique({
    where: { runId_candidateId: { runId, candidateId } },
    include: WITH_EDITOR,
  });
  if (found) return toArticle(found);
  const run = await getRun(runId);
  const draft = run?.drafts.find((d) => d.candidateId === candidateId);
  if (!run || !draft) return null;
  const fields: ArticleFields = {
    headline: draft.headline,
    summary: draft.summary,
    body: draft.body,
    seoTitle: draft.seoTitle,
    seoDescription: draft.seoDescription,
    category: CATEGORIES.includes(draft.category) ? draft.category : CATEGORIES[0]!,
    tags: draft.tags,
  };
  const checks = await checkArticle(run, candidateId, fields);
  // Two clicks on "Edit" at once still make one article: the losing insert hits the unique
  // (runId, candidateId) constraint and reads the winner's article instead.
  try {
    const row = await db().article.create({
      data: {
        runId,
        candidateId,
        ...fields,
        checks: checks as unknown as object,
        updatedById: userId,
      },
      include: WITH_EDITOR,
    });
    return toArticle(row);
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e;
    const row = await db().article.findUnique({
      where: { runId_candidateId: { runId, candidateId } },
      include: WITH_EDITOR,
    });
    return row ? toArticle(row) : null;
  }
}

export async function getArticle(id: string): Promise<Article | null> {
  if (!ID.test(id)) return null;
  const row = await db().article.findUnique({ where: { id }, include: WITH_EDITOR });
  return row ? toArticle(row) : null;
}

/** Newest edits first; optionally one run's articles. */
export async function listArticles(runId?: string): Promise<ArticleSummary[]> {
  if (runId !== undefined && !isRunId(runId)) return [];
  const rows = await db().article.findMany({
    where: runId ? { runId } : undefined,
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      runId: true,
      candidateId: true,
      status: true,
      headline: true,
      category: true,
      updatedAt: true,
      updatedBy: { select: { name: true } },
    },
  });
  return rows.map(({ updatedBy, ...r }) => ({
    ...r,
    status: r.status as ArticleStatus,
    updatedAt: r.updatedAt.toISOString(),
    updatedByName: updatedBy?.name ?? null,
  }));
}

/** The AI draft and the story's evidence, for the editor's fact sheet. */
export async function getArticleContext(article: Article): Promise<ArticleContext | null> {
  const run = await getRun(article.runId);
  const draft = run?.drafts.find((d) => d.candidateId === article.candidateId);
  const story = run?.candidates.find((c) => c.id === article.candidateId);
  if (!draft || !story) return null;
  return {
    draft,
    story: {
      headline: story.headline,
      url: story.url,
      publisher: story.publisher,
      publishedAt: story.publishedAt,
      claims: story.claims,
      evidence: story.evidence,
    },
    categories: CATEGORIES,
  };
}

export type SaveResult =
  | { ok: true; article: Article }
  | { ok: false; status: 400 | 404 | 409 | 422; message: string; article?: Article };

/**
 * Saves an edit. Rules: the editor's version must be current (409 otherwise); checks are re-run;
 * "ready" needs the blocking checks (figures, copying, advice) passing, and for a partially verified story the editor's confirmation
 * that they checked those claims; changing a ready article's text sends it back to editing.
 */
export async function saveArticle(id: string, input: unknown, userId: string): Promise<SaveResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, status: 400, message: "Invalid article: check every field." };
  const current = await getArticle(id);
  if (!current) return { ok: false, status: 404, message: "Article not found." };
  const { version, status, confirmPartial, ...fields } = parsed.data;
  if (version !== current.version)
    return {
      ok: false,
      status: 409,
      message: "This article was saved in another tab or window. Reload to see the latest version.",
      article: current,
    };

  const run = await getRun(current.runId);
  if (!run)
    return { ok: false, status: 404, message: "The research run for this article is gone." };
  const checks = await checkArticle(run, current.candidateId, fields);
  const changed = (Object.keys(fields) as (keyof ArticleFields)[]).some(
    (k) => JSON.stringify(fields[k]) !== JSON.stringify(current[k]),
  );
  const next: ArticleStatus =
    status ?? (changed && current.status === "ready" ? "draft" : current.status);
  if (next === "ready") {
    const failing = checks.filter((c) => !c.passed && BLOCKING_CHECKS.includes(c.check));
    if (failing.length > 0)
      return {
        ok: false,
        status: 422,
        message: `Fix the failing checks first: ${failing.map((c) => c.check.replace("_", " ")).join(", ")}.`,
      };
    const draft = run.drafts.find((d) => d.candidateId === current.candidateId);
    if (draft?.verificationStatus !== "verified" && !confirmPartial)
      return {
        ok: false,
        status: 422,
        message: "Confirm that you checked the partially verified claims.",
      };
  }

  // Conditional on the version: two saves racing can't both win.
  const { count } = await db().article.updateMany({
    where: { id, version },
    data: {
      ...fields,
      status: next,
      checks: checks as unknown as object,
      version: { increment: 1 },
      updatedById: userId,
    },
  });
  if (count === 0)
    return {
      ok: false,
      status: 409,
      message: "This article was saved in another tab or window. Reload to see the latest version.",
    };
  return { ok: true, article: (await getArticle(id))! };
}
