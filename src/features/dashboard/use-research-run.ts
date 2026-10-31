"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiErrorBody, ResearchRun, StartRunResponse } from "@/features/research/types";
import type { ResearchStatus } from "./data";

/** Wait before asking again when another tab is running this run's step. */
const BUSY_WAIT_MS = 3_000;
/** A page stops driving a run after this long (verification stops new work at 12 min). */
const MAX_RUN_MS = 30 * 60_000;
const MAX_STEP_FAILURES = 3;
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  return body?.error?.message ?? fallback;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One research run as seen by a page: load it, start it, retry a stage, and drive it to the end.
 * Each POST /step does one bounded piece of work on the server and returns the saved snapshot.
 * Any open page drives an unfinished run (the dashboard and the research page alike); the
 * server's per-run lock makes a second page wait (409) and show the other's progress instead.
 */
export function useResearchRun() {
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [status, setStatus] = useState<ResearchStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fail = useCallback((e: unknown) => {
    if (!mounted.current) return;
    setError(e instanceof Error && e.message ? e.message : "Research failed. Please try again.");
    setStatus("error");
  }, []);

  const follow = useCallback(async (runId: string) => {
    const startedAt = Date.now();
    let failures = 0;
    while (mounted.current) {
      if (Date.now() - startedAt > MAX_RUN_MS) {
        throw new Error("Research is taking too long. Reopen this run later to continue.");
      }
      const response = await fetch(`/api/research/${runId}/step`, { method: "POST" }).catch(
        () => null,
      );
      if (response?.status === 409) {
        // Another tab or request is working on this run: show its progress and wait.
        await sleep(BUSY_WAIT_MS);
        const snapshot = await fetch(`/api/research/${runId}`).catch(() => null);
        if (snapshot?.ok && mounted.current) setRun((await snapshot.json()) as ResearchRun);
        continue;
      }
      if (!response?.ok) {
        if (response?.status === 404)
          throw new Error(await readError(response, "The run was lost."));
        if (++failures >= MAX_STEP_FAILURES) {
          throw new Error(
            "Lost contact with the server while researching. Reopen the run to continue.",
          );
        }
        await sleep(BUSY_WAIT_MS);
        continue;
      }
      failures = 0;
      const snapshot = (await response.json()) as ResearchRun;
      if (!mounted.current) return;
      setRun(snapshot);
      if (snapshot.stage === "failed")
        throw new Error(snapshot.error?.message ?? "Research failed.");
      if (snapshot.stage === "completed") {
        setStatus("done");
        return;
      }
    }
  }, []);

  /** Shows a saved run and keeps driving it if it is unfinished. False when it doesn't exist. */
  const load = useCallback(
    async (runId: string): Promise<boolean> => {
      if (!RUN_ID.test(runId)) {
        setNotFound(true);
        return false;
      }
      const response = await fetch(`/api/research/${runId}`).catch(() => null);
      if (!mounted.current) return false;
      if (!response?.ok) {
        setNotFound(true);
        return false;
      }
      const snapshot = (await response.json()) as ResearchRun;
      setRun(snapshot);
      if (snapshot.stage === "completed") setStatus("done");
      else if (snapshot.stage === "failed") {
        setError(snapshot.error?.message ?? "Research failed.");
        setStatus("error");
      } else {
        setStatus("running");
        await follow(runId).catch(fail);
      }
      return true;
    },
    [follow, fail],
  );

  /** Starts a run for the given sources; `onCreated` gets its Run ID as soon as it exists. */
  const start = useCallback(
    async (sources: { id: string; enabled: boolean }[], onCreated?: (runId: string) => void) => {
      setStatus("running");
      setError(null);
      setRun(null);
      try {
        const response = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sources }),
        });
        if (!response.ok)
          throw new Error(await readError(response, `Research failed (${response.status}).`));
        const { runId } = (await response.json()) as StartRunResponse;
        onCreated?.(runId);
        await follow(runId);
      } catch (e) {
        fail(e);
      }
    },
    [follow, fail],
  );

  /**
   * Re-runs one stage of the current run (same Run ID): "verify" re-verifies failed / unfinished
   * stories, "draft" drafts queued stories without a draft.
   */
  const retry = useCallback(
    async (stage: "verify" | "draft") => {
      if (!run) return;
      setStatus("running");
      setError(null);
      try {
        const response = await fetch(`/api/research/${run.runId}/${stage}`, { method: "POST" });
        if (!response.ok)
          throw new Error(await readError(response, `Retry failed (${response.status}).`));
        await follow(run.runId);
      } catch (e) {
        fail(e);
      }
    },
    [run, follow, fail],
  );

  return { run, status, error, notFound, running: status === "running", load, start, retry };
}
