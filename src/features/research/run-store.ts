import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { ResearchRun } from "./types";

const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FINISHED_STAGES = ["completed", "failed"];
/** A run with no step for this long is abandoned and no longer blocks a new run. */
const ACTIVE_MS = 30 * 60_000;

/** The official-text passage an evidence item was matched on. Server-only; never sent to a browser. */
export type EvidencePassage = { text: string; organisation: string; url: string };

/** Only server-generated UUIDs are looked up. */
export function isRunId(id: string): boolean {
  return RUN_ID.test(id);
}

const json = (run: ResearchRun) => run as unknown as Prisma.InputJsonValue;

/** Saves a new run. */
export async function createRun(run: ResearchRun): Promise<void> {
  await db().researchRun.create({ data: { id: run.runId, stage: run.stage, data: json(run) } });
}

/** The unfinished run that stepped recently, if any (only one run at a time). */
// ponytail: check-then-create, so two simultaneous starts could both pass; a lock row fixes it.
export async function activeRunId(): Promise<string | null> {
  const row = await db().researchRun.findFirst({
    where: {
      stage: { notIn: FINISHED_STAGES },
      updatedAt: { gt: new Date(Date.now() - ACTIVE_MS) },
    },
    select: { id: true },
  });
  return row?.id ?? null;
}

/** The run snapshot (never the evidence passages). */
export async function getRun(runId: string): Promise<ResearchRun | undefined> {
  if (!isRunId(runId)) return undefined;
  const row = await db().researchRun.findUnique({ where: { id: runId }, select: { data: true } });
  return row ? (row.data as unknown as ResearchRun) : undefined;
}

// Saves for one run are chained so an older snapshot never overwrites a newer one.
const writes = ((globalThis as { __runWrites?: Map<string, Promise<void>> }).__runWrites ??=
  new Map());

/** Saves the run snapshot. Callers may fire and forget; await it before replying. */
export function saveRun(run: ResearchRun): Promise<void> {
  const data = json(structuredClone(run));
  const next = (writes.get(run.runId) ?? Promise.resolve())
    .then(async () => {
      await db().researchRun.update({ where: { id: run.runId }, data: { stage: run.stage, data } });
    })
    .catch((e: unknown) => console.error("saveRun failed", run.runId, e));
  writes.set(run.runId, next);
  return next;
}

/** Adds evidence passages for drafting (merged in the database, so parallel stories don't clash). */
export function saveEvidence(
  runId: string,
  passages: Record<string, EvidencePassage>,
): Promise<void> {
  return db()
    .$executeRaw`UPDATE "ResearchRun" SET "evidence" = "evidence" || ${JSON.stringify(passages)}::jsonb WHERE "id" = ${runId}::uuid`
    .then(() => undefined)
    .catch((e: unknown) => console.error("saveEvidence failed", runId, e));
}

/** Evidence passages of a run; empty when it has none. */
export async function loadEvidence(runId: string): Promise<Record<string, EvidencePassage>> {
  if (!isRunId(runId)) return {};
  const row = await db().researchRun.findUnique({
    where: { id: runId },
    select: { evidence: true },
  });
  return (row?.evidence ?? {}) as Record<string, EvidencePassage>;
}

/**
 * Takes the run for one step until `ms` from now; false when another request holds it. Atomic:
 * the conditional update succeeds for exactly one caller.
 */
export async function claimStep(runId: string, ms: number): Promise<boolean> {
  const now = new Date();
  const { count } = await db().researchRun.updateMany({
    where: { id: runId, OR: [{ stepLockUntil: null }, { stepLockUntil: { lt: now } }] },
    data: { stepLockUntil: new Date(now.getTime() + ms) },
  });
  return count === 1;
}

/** Releases the step lock after the step's snapshot is saved. */
export async function releaseStep(runId: string): Promise<void> {
  await writes.get(runId);
  await db().researchRun.update({ where: { id: runId }, data: { stepLockUntil: null } });
}
