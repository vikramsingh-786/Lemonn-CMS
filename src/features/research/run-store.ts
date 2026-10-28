import "server-only";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ResearchRun } from "./types";

const DIR = path.join(process.cwd(), ".data", "runs");
const MAX_IN_MEMORY = 10;
const MAX_FILES = 50;
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ponytail: local JSON files (.data/runs) + in-memory cache, one active run per server process.
// A database + job queue replaces this when the persistence phase starts.
// Kept on globalThis so dev hot reloads and separate route bundles share one registry.
type Store = {
  runs: Map<string, ResearchRun>;
  active: string | null;
  writes: Map<string, Promise<void>>;
  /** Server-only evidence passages per run (sidecar files), for drafting. */
  evidence?: Map<string, Record<string, EvidencePassage>>;
};
const store: Store = ((globalThis as { __researchRuns?: Store }).__researchRuns ??= {
  runs: new Map(),
  active: null,
  writes: new Map(),
});
const evidenceStore = (store.evidence ??= new Map());

/** The official-text passage an evidence item was matched on. Server-only; never sent to a browser. */
export type EvidencePassage = { text: string; organisation: string; url: string };

/** Only server-generated UUIDs reach the file system (no path traversal). */
export function isRunId(id: string): boolean {
  return RUN_ID.test(id);
}

/** Marks `runId` as the one active run; false when another run is in progress. */
export function claimActive(runId: string): boolean {
  if (store.active && store.active !== runId) return false;
  store.active = runId;
  return true;
}

export function releaseActive(runId: string) {
  if (store.active === runId) store.active = null;
}

export function isActive(runId: string): boolean {
  return store.active === runId;
}

function remember(run: ResearchRun) {
  store.runs.delete(run.runId);
  store.runs.set(run.runId, run);
  for (const old of [...store.runs.keys()].slice(0, -MAX_IN_MEMORY)) {
    if (old !== store.active) store.runs.delete(old);
  }
}

/** Registers a new run in memory (and on disk). */
export function addRun(run: ResearchRun) {
  remember(run);
  saveRun(run);
}

/** Run from memory, else from disk. A run left unfinished by a restart is marked interrupted. */
export async function getRun(runId: string): Promise<ResearchRun | undefined> {
  if (!isRunId(runId)) return undefined;
  const inMemory = store.runs.get(runId);
  if (inMemory) return inMemory;
  let run: ResearchRun;
  try {
    run = JSON.parse(await readFile(path.join(DIR, `${runId}.json`), "utf8")) as ResearchRun;
  } catch {
    return undefined;
  }
  if (run.stage !== "completed" && run.stage !== "failed" && !isActive(runId)) markInterrupted(run);
  remember(run);
  return run;
}

function markInterrupted(run: ResearchRun) {
  run.stage = "failed";
  run.currentStep = null;
  run.finishedAt ??= new Date().toISOString();
  run.error = {
    code: "internal_error",
    message:
      "The server restarted during this run. Finished results are kept; retry verification for the rest.",
  };
  for (const c of run.candidates) {
    if (c.status === "queued" || c.status === "pending_evidence" || c.status === "verifying") {
      c.status = "not_processed";
      c.statusReason = "Interrupted by a server restart. Not verified.";
    }
  }
}

/** Queues an atomic write of `json` to `file` behind earlier writes with the same key. */
function queueWrite(key: string, file: string, json: string): Promise<void> {
  const previous = store.writes.get(key) ?? Promise.resolve();
  const next = previous
    .then(async () => {
      await mkdir(DIR, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, json, "utf8");
      await rename(tmp, file);
    })
    .catch(() => {});
  store.writes.set(key, next);
  return next;
}

/**
 * Adds evidence passages (by evidence id) to the run's server-only sidecar
 * `.data/runs/<id>.evidence.json`. No API route reads this file.
 */
export function saveEvidence(
  runId: string,
  passages: Record<string, EvidencePassage>,
): Promise<void> {
  if (!isRunId(runId)) return Promise.resolve();
  const merged = { ...evidenceStore.get(runId), ...passages };
  evidenceStore.set(runId, merged);
  return queueWrite(
    `${runId}:evidence`,
    path.join(DIR, `${runId}.evidence.json`),
    JSON.stringify(merged),
  );
}

/** Evidence passages for a run (memory, else disk); empty when the run has none (older runs). */
export async function loadEvidence(runId: string): Promise<Record<string, EvidencePassage>> {
  if (!isRunId(runId)) return {};
  const inMemory = evidenceStore.get(runId);
  if (inMemory) return inMemory;
  try {
    const passages = JSON.parse(
      await readFile(path.join(DIR, `${runId}.evidence.json`), "utf8"),
    ) as Record<string, EvidencePassage>;
    evidenceStore.set(runId, passages);
    return passages;
  } catch {
    return {};
  }
}

/**
 * Writes the run to .data/runs/<id>.json (atomic: temp file + rename). Writes for one run are
 * queued so an older snapshot never overwrites a newer one. Failures are swallowed: the run
 * itself keeps going in memory.
 */
export function saveRun(run: ResearchRun): Promise<void> {
  const write = queueWrite(run.runId, path.join(DIR, `${run.runId}.json`), JSON.stringify(run));
  return write.then(() => prune().catch(() => {}));
}

/** Keeps the newest MAX_FILES runs on disk (each with its evidence sidecar). */
async function prune() {
  const names = (await readdir(DIR)).filter((n) => /^[0-9a-f-]{36}\.json$/.test(n));
  if (names.length <= MAX_FILES) return;
  const withTime = await Promise.all(
    names.map(async (n) => ({ n, t: (await stat(path.join(DIR, n))).mtimeMs })),
  );
  withTime.sort((a, b) => a.t - b.t);
  for (const { n } of withTime.slice(0, withTime.length - MAX_FILES)) {
    const id = n.slice(0, -".json".length);
    evidenceStore.delete(id);
    await unlink(path.join(DIR, n)).catch(() => {});
    await unlink(path.join(DIR, `${id}.evidence.json`)).catch(() => {});
  }
}
