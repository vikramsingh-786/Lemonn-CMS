import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
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

/**
 * JSON for a jsonb column. PostgreSQL rejects the NUL character in jsonb text, and one stray NUL
 * in a publisher's title made every save of a run fail, so it is removed.
 */
const clean = (value: unknown) =>
  JSON.parse(JSON.stringify(value).replace(/(?<!\\)\\u0000/g, "")) as Prisma.InputJsonValue;
const json = (run: ResearchRun) => clean(run);

/**
 * The step lock this request holds, carried through everything a step does (also the saves made
 * deep inside verification). Saves made under it only land while the lock is still ours.
 */
const stepScope = new AsyncLocalStorage<{ runId: string; lock: Date }>();

/** Runs `fn` as the holder of `lock` on `runId` (see saveRun). */
export function runWithLock<T>(runId: string, lock: Date, fn: () => Promise<T>): Promise<T> {
  return stepScope.run({ runId, lock }, fn);
}

/** Advisory lock id that serialises "is a run going? then start/resume one". */
const START_LOCK = 0x4c656d6f; // "Lemo"

/** Saves a new run. */
export async function createRun(run: ResearchRun, createdById?: string): Promise<void> {
  await db().researchRun.create({
    data: { id: run.runId, stage: run.stage, data: json(run), createdById },
  });
}

/**
 * Saves a new run unless another run is going, atomically: two simultaneous starts can't both
 * pass the check (a transaction-scoped advisory lock serialises them). Returns the active run's id
 * when one is going, else null (created).
 */
export async function createRunIfIdle(
  run: ResearchRun,
  createdById?: string,
): Promise<string | null> {
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${START_LOCK})`;
    const active = await activeRunId(tx);
    if (active) return active;
    await tx.researchRun.create({
      data: { id: run.runId, stage: run.stage, data: json(run), createdById },
    });
    return null;
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
export async function activeRunId(
  client: Pick<ReturnType<typeof db>, "researchRun"> = db(),
): Promise<string | null> {
  const row = await client.researchRun.findFirst({
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

/**
 * The run snapshot with its owner (never the evidence passages). An abandoned run is shown as
 * stopped; it is stopped in the database only with `stopAbandoned` (actions that change the run),
 * so reading a run never writes.
 */
export async function getRun(
  runId: string,
  { stopAbandoned = false }: { stopAbandoned?: boolean } = {},
): Promise<ResearchRun | undefined> {
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
    if (stopAbandoned)
      await db().researchRun.updateMany({
        where: { id: runId, stage: row.stage },
        data: { stage: run.stage, data: json(run) },
      });
  }
  return run;
}

// Saves for one run are chained so an older snapshot never overwrites a newer one.
const writes = ((globalThis as { __runWrites?: Map<string, Promise<unknown>> }).__runWrites ??=
  new Map());

/**
 * Saves the run snapshot. Resolves true when written, false when it may not be written: the run was
 * cancelled meanwhile, or this save belongs to a step that no longer holds the run's lock (its lock
 * expired and another request took over, or the run was resumed). Rejects when the database fails,
 * so a step never reports progress that was not saved.
 */
export function saveRun(run: ResearchRun): Promise<boolean> {
  const data = json(structuredClone(run));
  const scope = stepScope.getStore();
  const lock = scope?.runId === run.runId ? scope.lock : undefined;
  const next = (writes.get(run.runId) ?? Promise.resolve()).then(async () => {
    // A cancelled run stays cancelled: a step still running when the editor cancelled must not
    // write its (older) stage back over the cancellation.
    const { count } = await db().researchRun.updateMany({
      where: { id: run.runId, stage: { not: "cancelled" }, ...(lock && { stepLockUntil: lock }) },
      data: { stage: run.stage, data },
    });
    return count === 1;
  });
  writes.set(
    run.runId,
    next.catch(() => {}),
  );
  return next;
}

/** Adds evidence passages for drafting (merged in the database, so parallel stories don't clash). */
export async function saveEvidence(
  runId: string,
  passages: Record<string, EvidencePassage>,
): Promise<void> {
  await db()
    .$executeRaw`UPDATE "ResearchRun" SET "evidence" = "evidence" || ${JSON.stringify(clean(passages))}::jsonb WHERE "id" = ${runId}::uuid`;
}

/** Replaces the stories discovery dropped as off-topic (kept out of the polled run snapshot). */
export async function saveOffTopic(runId: string, items: OffTopicItem[]): Promise<void> {
  await db().researchRun.updateMany({
    where: { id: runId },
    data: { offTopic: clean(items) },
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
 * Takes the run for one step until `ms` from now. Returns the lock (its expiry time, which is also
 * the holder's token for releaseStep and saveRun), or null when another request holds the run.
 * Atomic: the conditional update succeeds for exactly one caller.
 */
export async function claimStep(runId: string, ms: number): Promise<Date | null> {
  const now = new Date();
  const lock = new Date(now.getTime() + ms);
  const { count } = await db().researchRun.updateMany({
    where: { id: runId, OR: [{ stepLockUntil: null }, { stepLockUntil: { lt: now } }] },
    data: { stepLockUntil: lock },
  });
  return count === 1 ? lock : null;
}

/** How long a short action (resume, retry, verify one story) holds the run. */
const ACTION_LOCK_MS = 30_000;

/**
 * Runs `fn` while holding the run's lock briefly, so it can't interleave with a running step or a
 * second click (its saves only land while the lock is held). Null when the run is busy.
 */
export async function withRunLock<T>(
  runId: string,
  fn: (lock: Date) => Promise<T>,
): Promise<T | null> {
  const lock = await claimStep(runId, ACTION_LOCK_MS);
  if (!lock) return null;
  try {
    return await runWithLock(runId, lock, () => fn(lock));
  } finally {
    await releaseStep(runId, lock);
  }
}

/**
 * Saves a run reopened by resume (saveRun never writes over a cancelled run), while the caller
 * holds the run's lock (`lock`), so no earlier step can still be writing. Atomic with the
 * one-run-at-a-time check. Returns "busy" when another run is going, "stale" when it was no longer
 * stopped (resumed twice at once), else "ok". The lock is kept; the caller releases it.
 */
export async function saveReopenedRun(
  run: ResearchRun,
  lock: Date,
): Promise<"ok" | "busy" | "stale"> {
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${START_LOCK})`;
    const active = await activeRunId(tx);
    if (active && active !== run.runId) return "busy";
    const { count } = await tx.researchRun.updateMany({
      where: { id: run.runId, stage: { in: ["cancelled", "failed"] }, stepLockUntil: lock },
      data: { stage: run.stage, data: json(structuredClone(run)) },
    });
    return count === 1 ? "ok" : "stale";
  });
}

/** Deletes a run and its articles. False when it doesn't exist. */
export async function deleteRun(runId: string): Promise<boolean> {
  if (!isRunId(runId)) return false;
  const { count } = await db().researchRun.deleteMany({ where: { id: runId } });
  return count === 1;
}

/**
 * Releases the step lock after the step's snapshot is saved, only if it is still `lock`: a step
 * that outlived its lock must not free the lock another request now holds.
 */
export async function releaseStep(runId: string, lock: Date): Promise<void> {
  await writes.get(runId);
  // updateMany: the run may have been deleted by an admin while this step ran.
  await db().researchRun.updateMany({
    where: { id: runId, stepLockUntil: lock },
    data: { stepLockUntil: null },
  });
}
