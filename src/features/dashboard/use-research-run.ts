"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ApiErrorBody,
  CurrentRunResponse,
  ResearchRun,
  StartRunResponse,
} from "@/features/research/types";
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

/** How often a read-only viewer refreshes a run it is watching. */
const WATCH_MS = 3_000;

/** Sign-in URL that comes back to this page (after a 401: the session ended). */
function loginUrl() {
  const here = window.location.pathname + window.location.search;
  return `/login?expired=1&next=${encodeURIComponent(here)}`;
}

/**
 * One research run as seen by a page: load it, start it, retry a stage, and drive it to the end.
 * Each POST /step does one bounded piece of work on the server and returns the saved snapshot.
 * Any open page drives an unfinished run (the dashboard and the research page alike); the
 * server's per-run lock makes a second page wait (409) and show the other's progress instead.
 * `canRun` false (read-only role): the page only watches (polls) a run and never drives it, so
 * it can't spend API credits. A 401 sends the editor to sign in and back here.
 */
export function useResearchRun(canRun = true) {
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [status, setStatus] = useState<ResearchStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  /** Neutral information for the editor (not an error), e.g. "showing the run already going". */
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(true);
  /** The run this page is driving, and whether the editor asked to stop it. */
  const current = useRef<string | null>(null);
  const stopped = useRef(false);
  /** Cancel clicked while the run was still being created (no Run ID yet): done once it exists. */
  const cancelPending = useRef(false);
  const router = useRouter();
  const toLogin = useCallback(() => router.push(loginUrl()), [router]);

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

  const follow = useCallback(
    async (runId: string) => {
      const startedAt = Date.now();
      let failures = 0;
      current.current = runId;
      stopped.current = false;
      while (mounted.current && !stopped.current) {
        if (Date.now() - startedAt > MAX_RUN_MS) {
          throw new Error("Research is taking too long. Reopen this run later to continue.");
        }
        const response = canRun
          ? await fetch(`/api/research/${runId}/step`, { method: "POST" }).catch(() => null)
          : await sleep(WATCH_MS).then(() => fetch(`/api/research/${runId}`).catch(() => null));
        if (response?.status === 401) return toLogin();
        if (response?.status === 403)
          throw new Error(await readError(response, "Your role can't run research."));
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
        // Cancelled while this step ran: keep the cancelled snapshot that cancel() showed.
        if (!mounted.current || stopped.current) return;
        setRun(snapshot);
        if (snapshot.stage === "cancelled") {
          setStatus("cancelled");
          return;
        }
        if (snapshot.stage === "failed")
          throw new Error(snapshot.error?.message ?? "Research failed.");
        if (snapshot.stage === "completed") {
          setStatus("done");
          return;
        }
      }
    },
    [canRun, toLogin],
  );

  /** Shows a saved run and keeps driving it if it is unfinished. False when it doesn't exist. */
  const load = useCallback(
    async (runId: string): Promise<boolean> => {
      if (!RUN_ID.test(runId)) {
        setNotFound(true);
        return false;
      }
      const response = await fetch(`/api/research/${runId}`).catch(() => null);
      if (!mounted.current) return false;
      if (response?.status === 401) {
        toLogin();
        return false;
      }
      if (!response?.ok) {
        setNotFound(true);
        return false;
      }
      const snapshot = (await response.json()) as ResearchRun;
      setRun(snapshot);
      current.current = runId;
      if (snapshot.stage === "completed") setStatus("done");
      else if (snapshot.stage === "cancelled") setStatus("cancelled");
      else if (snapshot.stage === "failed") {
        setError(snapshot.error?.message ?? "Research failed.");
        setStatus("error");
      } else {
        setStatus("running");
        await follow(runId).catch(fail);
      }
      return true;
    },
    [follow, fail, toLogin],
  );

  /** Cancels `runId` on the server; if it finished meanwhile, shows it as it finished. */
  const cancelOnServer = useCallback(
    async (runId: string) => {
      const response = await fetch(`/api/research/${runId}/cancel`, { method: "POST" }).catch(
        () => null,
      );
      if (!mounted.current) return;
      if (response?.status === 401) return toLogin();
      if (response?.ok) {
        setRun((await response.json()) as ResearchRun);
        setError(null);
        setStatus("cancelled");
      } else {
        // Already finished (409) or unreachable: show the run's real state again.
        await load(runId);
      }
    },
    [load, toLogin],
  );

  /**
   * Stops the run this page is driving. Work already finished is kept; a new run can start at
   * once. Clicked before the run exists, it cancels the run as soon as it is created.
   */
  const cancel = useCallback(async () => {
    stopped.current = true;
    const runId = current.current;
    if (!runId) {
      cancelPending.current = true;
      return;
    }
    await cancelOnServer(runId);
  }, [cancelOnServer]);

  /** Starts a run for the given sources; `onCreated` gets its Run ID as soon as it exists. */
  const start = useCallback(
    async (sources: { id: string; enabled: boolean }[], onCreated?: (runId: string) => void) => {
      setStatus("running");
      setError(null);
      setNotice(null);
      setRun(null);
      current.current = null;
      cancelPending.current = false;
      try {
        const response = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sources }),
        });
        if (response.status === 401) return toLogin();
        if (response.status === 409) {
          // A run is already going (another tab, a refresh, another editor): show it and keep it
          // moving instead of leaving the editor at a dead end.
          const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
          if (body?.runId) {
            setNotice("A research run was already in progress, so it is shown here and continues.");
            onCreated?.(body.runId);
            await load(body.runId);
            return;
          }
          throw new Error(body?.error.message ?? "A research run is already in progress.");
        }
        if (!response.ok)
          throw new Error(await readError(response, `Research failed (${response.status}).`));
        const { runId } = (await response.json()) as StartRunResponse;
        current.current = runId;
        onCreated?.(runId);
        if (cancelPending.current) {
          cancelPending.current = false;
          await cancelOnServer(runId);
          return;
        }
        await follow(runId);
      } catch (e) {
        fail(e);
      }
    },
    [follow, fail, cancelOnServer, load, toLogin],
  );

  /**
   * For a page opened without a Run ID (refresh, new tab, another device): shows the run in
   * progress and keeps it going, else the latest run. Returns the Run ID shown, or null.
   */
  const loadCurrent = useCallback(async (): Promise<string | null> => {
    const response = await fetch("/api/research").catch(() => null);
    if (response?.status === 401) {
      toLogin();
      return null;
    }
    if (!response?.ok || !mounted.current) return null;
    const { activeRunId, latestRunId } = (await response.json()) as CurrentRunResponse;
    const runId = activeRunId ?? latestRunId;
    if (!runId) return null;
    if (activeRunId)
      setNotice(
        canRun
          ? "Research in progress: showing it and continuing where it left off."
          : "Research in progress: you're watching it (read-only); it advances while a team member has it open.",
      );
    void load(runId);
    return runId;
  }, [load, canRun, toLogin]);

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
        if (response.status === 401) return toLogin();
        if (!response.ok)
          throw new Error(await readError(response, `Retry failed (${response.status}).`));
        await follow(run.runId);
      } catch (e) {
        fail(e);
      }
    },
    [run, follow, fail, toLogin],
  );

  return {
    run,
    status,
    error,
    notFound,
    notice,
    running: status === "running",
    load,
    loadCurrent,
    start,
    retry,
    cancel,
  };
}
