"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatIst } from "@/features/dashboard/format";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, type ArticleStatus, type ArticleSummary } from "./types";

const FILTERS: { value: ArticleStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "In editing" },
  { value: "ready", label: "Ready to publish" },
  { value: "rejected", label: "Rejected" },
];

/** Every edited article across research runs, newest edit first, filterable by status. */
export function ArticlesList({ articles }: { articles: ArticleSummary[] }) {
  const [filter, setFilter] = useState<ArticleStatus | "all">("all");
  const visible = filter === "all" ? articles : articles.filter((a) => a.status === filter);
  const count = (f: ArticleStatus | "all") =>
    f === "all" ? articles.length : articles.filter((a) => a.status === f).length;

  return (
    <section className="surface-raised rounded-lg border border-border bg-card">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "pill-raised inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                filter === f.value
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
              <span className="tabular-nums opacity-70">{count(f.value)}</span>
            </button>
          ))}
        </div>
      </div>
      {visible.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
            <FileText aria-hidden className="size-5" />
          </span>
          <h2 className="mt-3 text-sm font-semibold">
            {articles.length === 0 ? "No articles yet" : "Nothing in this view"}
          </h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {articles.length === 0
              ? "Open a draft from the dashboard and choose Edit; it appears here as an article."
              : "Articles with this status will appear here."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((a) => (
            <li key={a.id}>
              <Link
                href={`/articles/${a.id}`}
                className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset sm:px-6"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge
                      variant={
                        a.status === "ready"
                          ? "success"
                          : a.status === "rejected"
                            ? "neutral"
                            : "warning"
                      }
                    >
                      {STATUS_LABEL[a.status]}
                    </Badge>
                    <Badge variant="outline">{a.category}</Badge>
                    <span className="text-muted-foreground">Edited {formatIst(a.updatedAt)}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 font-medium">{a.headline}</p>
                </div>
                <ArrowRight
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
