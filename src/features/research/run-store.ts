import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { OffTopicItem, ResearchRun } from "./types";

const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FINISHED_STAGES = ["completed", "failed", "cancelled"];
/**
 * A run with no step for this long is abandoned: it no longer blocks a new run, and the next read
 * stops it for good (its page was closed; resuming hours later would research a stale window).
 */
const ACTIVE_MS = 30 * 60_000;

/** The official-text passage an evidence item was matched on. Server-only; never sent to a browser. */
export type EvidencePassage = { text: string; organisation: string; url: string };

/** Only server-generated UUIDs are looked up. */
export function isRunId(id: string): boolean {
  return RUN_ID.test(id);
}

const json = (run: ResearchRun) => run as unknown as Prisma.InputJsonValue;

/** Saves a new run. */
export async function createRun(run: ResearchRun, createdById?: string): Promise<void> {
  await db().researchRun.create({
    data: { id: run.runId, stage: run.stage, data: json(run), createdById },
  });
}

/**
 * An unfinished run with a step running or one recently: it is going (its page is open). An
 * unfinished run that is not active is abandoned and is stopped on its next read.
 */
export function isActive(row: { stage: string; updatedAt: Date; stepLockUntil: Date | null }) {
  const now = Date.now();
  return (
    !FINISHED_STAGES.includes(row.stage) &&
    (row.updatedAt.getTime() > now - ACTIVE_MS ||
      (row.stepLockUntil !== null && row.stepLockUntil.getTime() > now))
  );
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

/** The most recently created run, if any. */
export async function latestRunId(): Promise<string | null> {
  const row = await db().researchRun.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return row?.id ?? null;
}

/**
 * Stops an unfinished run: finished work (stories, verifications, drafts) is kept, stories still
 * waiting are marked not verified.
 */
export function stopRun(run: ResearchRun, detail: string): void {
  run.stage = "cancelled";
  run.currentStep = null;
  run.error = null;
  run.finishedAt = new Date().toISOString();
  run.stageDetail = detail;
  for (const c of run.candidates) {
    if (c.status === "queued" || c.status === "pending_evidence" || c.status === "verifying") {
      c.status = "not_processed";
      c.statusReason = "Not verified: the research run was stopped.";
    }
  }
  run.counts.notProcessed = run.candidates.filter((c) => c.status === "not_processed").length;
  delete run.verifyPass;
  delete run.draftPass;
}

/** The run snapshot with its owner (never the evidence passages). Stops it if abandoned. */
export async function getRun(runId: string): Promise<ResearchRun | undefined> {
  if (!isRunId(runId)) return undefined;
  const row = await db().researchRun.findUnique({
    where: { id: runId },
    select: { data: true, stage: true, updatedAt: true, stepLockUntil: true, createdById: true },
  });
  if (!row) return undefined;
  const run = row.data as unknown as ResearchRun;
  if (row.createdById) run.startedById = row.createdById;
  else delete run.startedById;
  // A run cancelled by hand in the database (only the stage column changed) stays cancelled.
  if (row.stage === "cancelled" && run.stage !== "cancelled") {
    run.stage = "cancelled";
    run.currentStep = null;
  }
  if (!FINISHED_STAGES.includes(run.stage) && !isActive(row)) {
    stopRun(run, "Stopped: no progress for 30 minutes (the page running it was closed)");
    await db().researchRun.updateMany({
      where: { id: runId, stage: row.stage },
      data: { stage: run.stage, data: json(run) },
    });
  }
  return run;
}

// Saves for one run are chained so an older snapshot never overwrites a newer one.
const writes = ((globalThis as { __runWrites?: Map<string, Promise<void>> }).__runWrites ??=
  new Map());

/** Saves the run snapshot. Callers may fire and forget; await it before replying. */
export function saveRun(run: ResearchRun): Promise<void> {
  const data = json(structuredClone(run));
  const next = (writes.get(run.runId) ?? Promise.resolve())
    .then(async () => {
      // A cancelled run stays cancelled: a step still running when the editor cancelled must not
      // write its (older) stage back over the cancellation.
      await db().researchRun.updateMany({
        where: { id: run.runId, stage: { not: "cancelled" } },
        data: { stage: run.stage, data },
      });
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

/** Replaces the stories discovery dropped as off-topic (kept out of the polled run snapshot). */
export async function saveOffTopic(runId: string, items: OffTopicItem[]): Promise<void> {
  await db().researchRun.updateMany({
    where: { id: runId },
    data: { offTopic: items as unknown as Prisma.InputJsonValue },
  });
}

/** Stories discovery dropped as off-topic; empty for older runs or an unknown id. */
export async function loadOffTopic(runId: string): Promise<OffTopicItem[]> {
  if (!isRunId(runId)) return [];
  const row = await db().researchRun.findUnique({
    where: { id: runId },
    select: { offTopic: true },
  });
  return (row?.offTopic ?? []) as unknown as OffTopicItem[];
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

/**
 * Saves a run reopened by resume (saveRun never writes over a cancelled run). False when it was
 * no longer stopped (resumed twice at once).
 */
export async function saveReopenedRun(run: ResearchRun): Promise<boolean> {
  const { count } = await db().researchRun.updateMany({
    where: { id: run.runId, stage: { in: ["cancelled", "failed"] } },
    data: { stage: run.stage, data: json(structuredClone(run)), stepLockUntil: null },
  });
  return count === 1;
}

/** Deletes a run and its articles. False when it doesn't exist. */
export async function deleteRun(runId: string): Promise<boolean> {
  if (!isRunId(runId)) return false;
  const { count } = await db().researchRun.deleteMany({ where: { id: runId } });
  return count === 1;
}

/** Releases the step lock after the step's snapshot is saved. */
export async function releaseStep(runId: string): Promise<void> {
  await writes.get(runId);
  // updateMany: the run may have been deleted by an admin while this step ran.
  await db().researchRun.updateMany({ where: { id: runId }, data: { stepLockUntil: null } });
}
