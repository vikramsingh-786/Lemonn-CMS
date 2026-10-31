import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { formatIst } from "@/features/dashboard/format";
import { STAGE_LABEL } from "@/features/dashboard/research-progress";
import { isActive } from "@/features/research/run-store";
import type { RunStage } from "@/features/research/types";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/roles";
import { AdminTabs } from "../admin-tabs";
import { RunActions, type RunState } from "./run-actions";

export const metadata: Metadata = { title: "Research runs · Lemonn Newsroom" };

type Row = {
  id: string;
  stage: string;
  createdAt: Date;
  updatedAt: Date;
  stepLockUntil: Date | null;
  detail: string | null;
  startedBy: string | null;
  owner: string | null;
  ownerEmail: string | null;
  stories: number;
  drafts: number;
  articles: bigint;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What the admin can do with a run, from its stage and whether its page is still driving it. */
function stateOf(row: Row): RunState {
  if (row.stage === "completed") return "completed";
  if (row.stage === "failed" || row.stage === "cancelled") return "stopped";
  return isActive(row) ? "running" : "stopped"; // abandoned: stopped on its next read
}

const BADGE: Record<RunState, { label: string; variant: "success" | "neutral" | "warning" }> = {
  running: { label: "Running", variant: "warning" },
  stopped: { label: "Stopped", variant: "neutral" },
  completed: { label: "Completed", variant: "success" },
};

async function RunsList() {
  const me = await requireUser("/admin/runs");
  if (!can(me.role, "runs:manage"))
    return (
      <p role="alert" className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
        Only admins can manage research runs.
      </p>
    );
  // Only the fields shown: a run's data holds every story and draft.
  // ponytail: newest 100 only; add paging when admins need older runs here.
  const rows = await db().$queryRaw<Row[]>`
    SELECT r.id, r.stage, r."createdAt", r."updatedAt", r."stepLockUntil",
      r.data->>'stageDetail' AS detail, r.data->>'startedBy' AS "startedBy",
      u.name AS owner, u.email AS "ownerEmail",
      jsonb_array_length(r.data->'candidates') AS stories,
      jsonb_array_length(r.data->'drafts') AS drafts,
      (SELECT count(*) FROM "Article" a WHERE a."runId" = r.id) AS articles
    FROM "ResearchRun" r LEFT JOIN "User" u ON u.id = r."createdById"
    ORDER BY r."createdAt" DESC LIMIT 100`;
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">No research runs yet.</p>;

  return (
    <section className="surface-raised overflow-hidden rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              {["Run", "Owner", "Status", "Started", "Last activity", "Results", "Actions"].map(
                (h) => (
                  <th key={h} scope="col" className="px-5 py-3 font-medium">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const state = stateOf(r);
              const stage = STAGE_LABEL[r.stage as RunStage] ?? r.stage;
              const abandoned = state === "stopped" && !["failed", "cancelled"].includes(r.stage);
              return (
                <tr key={r.id} className="align-top">
                  <td className="px-5 py-3">
                    <Link
                      href={`/research/${r.id}`}
                      className="font-mono text-xs underline-offset-2 hover:underline"
                    >
                      {r.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    {r.owner ? (
                      <>
                        <span className="font-medium">{r.owner}</span>
                        <span className="block text-xs break-all text-muted-foreground">
                          {r.ownerEmail}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        {r.startedBy ?? "No owner (before accounts)"}
                      </span>
                    )}
                  </td>
                  <td className="max-w-64 px-5 py-3">
                    <Badge variant={BADGE[state].variant}>
                      {state === "running" ? `Running · ${stage}` : BADGE[state].label}
                    </Badge>
                    {r.detail && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {abandoned
                          ? "Stopped: no progress for 30 minutes (the page running it was closed)"
                          : r.detail}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {formatIst(r.createdAt.toISOString())}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {formatIst(r.updatedAt.toISOString())}
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground tabular-nums">
                    {plural(r.stories, "story", "stories")} · {plural(r.drafts, "draft")} ·{" "}
                    {plural(Number(r.articles), "article")}
                  </td>
                  <td className="px-5 py-3">
                    <RunActions runId={r.id} state={state} articles={Number(r.articles)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function RunsPage() {
  return (
    <AppShell>
      <AdminTabs active="/admin/runs" />
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Research runs
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Every run and the account that owns it. Stop a running run, resume a stopped one where it
          stopped (it then moves on its research page; keep that page open), or delete a run with
          its articles.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading runs…</p>}>
        <RunsList />
      </Suspense>
    </AppShell>
  );
}
