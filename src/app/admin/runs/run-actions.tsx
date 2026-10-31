"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleStop, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { ApiErrorBody } from "@/features/research/types";

export type RunState = "running" | "stopped" | "completed";

type Confirm = "stop" | "delete" | null;

/** Stop, resume or delete one run (admin). Resume opens the run's page, which then drives it. */
export function RunActions({
  runId,
  state,
  articles,
}: {
  runId: string;
  state: RunState;
  articles: number;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: "POST" | "DELETE", path: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/research/${runId}${path}`, { method }).catch(() => null);
    setBusy(false);
    if (response?.status === 401) {
      router.push(`/login?expired=1&next=${encodeURIComponent("/admin/runs")}`);
      return false;
    }
    if (!response?.ok) {
      const body = (await response?.json().catch(() => null)) as ApiErrorBody | null;
      setError(body?.error.message ?? "That didn't work. Try again.");
      router.refresh(); // the run may have changed meanwhile
      return false;
    }
    return true;
  }

  async function confirmed() {
    const action = confirm;
    setConfirm(null);
    const ok = action === "stop" ? await call("POST", "/cancel") : await call("DELETE", "");
    if (ok) router.refresh();
  }

  async function resume() {
    if (await call("POST", "/resume")) router.push(`/research/${runId}`);
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap gap-2">
        {state === "running" && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirm("stop")}>
            <CircleStop aria-hidden />
            Stop
          </Button>
        )}
        {state === "stopped" && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void resume()}>
            <Play aria-hidden />
            Resume
          </Button>
        )}
        {state !== "running" && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirm("delete")}>
            <Trash2 aria-hidden />
            Delete
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="max-w-56 text-xs text-destructive">
          {error}
        </p>
      )}
      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === "stop" ? "Stop this research run?" : "Delete this research run?"}
        actions={
          <>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Keep it
            </Button>
            <Button onClick={() => void confirmed()}>
              {confirm === "stop" ? "Stop run" : "Delete run"}
            </Button>
          </>
        }
      >
        {confirm === "stop"
          ? "Stories, verifications and drafts finished so far are kept; nothing else runs. You can resume it later from here."
          : `The run, its stories, evidence and drafts${
              articles > 0
                ? `, and ${articles} edited article${articles === 1 ? "" : "s"} made from it,`
                : ""
            } are deleted for good. This can't be undone.`}
      </Dialog>
    </div>
  );
}
