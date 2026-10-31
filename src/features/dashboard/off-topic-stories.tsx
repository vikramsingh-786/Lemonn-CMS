"use client";

import { useState } from "react";
import type { OffTopicItem, ResearchRun } from "@/features/research/types";
import { formatIst } from "./format";
import { SourceLink } from "./status";

/**
 * Stories discovery dropped because no topic matched, so editors can spot a story the filter
 * missed (then tune src/features/research/topics.ts). Loaded when opened (it can be ~150 KB).
 * Titles are untrusted: rendered as text.
 */
export function OffTopicStories({ run }: { run: ResearchRun }) {
  const [publisher, setPublisher] = useState("all");
  const [items, setItems] = useState<OffTopicItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const total = run.coverage.reduce((n, c) => n + c.offTopic, 0);
  if (total === 0) return null;

  function load(open: boolean) {
    if (!open || items) return;
    setFailed(false);
    fetch(`/api/research/${run.runId}/off-topic`)
      .then((r) => (r.ok ? (r.json() as Promise<{ items: OffTopicItem[] }>) : Promise.reject()))
      .then((data) => setItems(data.items))
      .catch(() => setFailed(true));
  }

  const list = items ?? [];
  const publishers = [...new Set(list.map((i) => i.publisher))];
  const shown = publisher === "all" ? list : list.filter((i) => i.publisher === publisher);

  return (
    <details
      className="surface-raised group rounded-lg border border-border bg-card"
      onToggle={(e) => load(e.currentTarget.open)}
    >
      <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2 rounded-lg px-5 py-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:px-6">
        <span className="font-display text-lg font-semibold tracking-tight">
          Dropped as off-topic
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {total}
          <span className="ml-2 font-medium text-foreground group-open:hidden">Show</span>
        </span>
      </summary>
      <div className="border-t border-border px-5 py-4 sm:px-6">
        <p className="text-sm text-muted-foreground">
          No topic keyword matched these titles (or only the publisher&apos;s tags matched outside a
          business section). If a market story is here, the topic keywords need a new phrase.
        </p>
        {failed && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Couldn&apos;t load the dropped stories. Close and open this section to try again.
          </p>
        )}
        {!items && !failed && <p className="mt-3 text-sm text-muted-foreground">Loading…</p>}
        {items?.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            Not saved for this run (runs before 1 Nov 2026 kept only the count).
          </p>
        )}
        {list.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Showing the newest {list.length} of {total} (up to 100 per source).
          </p>
        )}
        {list.length > 0 && (
          <label className="mt-3 flex items-center gap-2 text-sm">
            Publisher
            <select
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
              className="rounded-xl border border-input bg-card px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <option value="all">All ({list.length})</option>
              {publishers.map((p) => (
                <option key={p} value={p}>
                  {p} ({list.filter((i) => i.publisher === p).length})
                </option>
              ))}
            </select>
          </label>
        )}
        <ul className="mt-3 flex flex-col gap-1.5 text-sm">
          {shown.map((i) => (
            <li key={i.url} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {i.publishedAt ? formatIst(i.publishedAt) : "Time unknown"} · {i.publisher}
              </span>
              <SourceLink href={i.url}>{i.title}</SourceLink>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
