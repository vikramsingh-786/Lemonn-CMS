"use client";

import { useState } from "react";
import { FileText, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ARTICLE_STATUS_LABEL, type Article, type ArticleStatus } from "./data";

type Filter = "all" | ArticleStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "ready", label: "Ready to Publish" },
  { value: "published", label: "Published" },
];

type ArticleReviewProps = {
  articles: readonly Article[];
  onPublish: (article: Article) => void;
};

export function ArticleReview({ articles, onPublish }: ArticleReviewProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = filter === "all" ? articles : articles.filter((a) => a.status === filter);
  const countFor = (value: Filter) =>
    value === "all" ? articles.length : articles.filter((a) => a.status === value).length;

  return (
    <section
      id="articles"
      aria-labelledby="articles-heading"
      className="scroll-mt-28 rounded-lg border border-border bg-card"
    >
      <div className="border-b border-border p-4 sm:p-5">
        <h2 id="articles-heading" className="text-base font-semibold">
          Research Results &amp; Articles
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review drafts before they are published to the Lemonn website.
        </p>
        <div role="group" aria-label="Filter articles" className="mt-4 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                filter === f.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {f.label}
              <span className="tabular-nums opacity-70">{countFor(f.value)}</span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState filtered={filter !== "all"} />
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((article) => (
            <li
              key={article.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {article.isSample && <Badge variant="warning">Sample · Not real news</Badge>}
                  <Badge variant="outline">{ARTICLE_STATUS_LABEL[article.status]}</Badge>
                </div>
                <h3 className="mt-2 text-sm font-semibold">{article.title}</h3>
                <p className="mt-1 max-w-prose text-sm text-muted-foreground">{article.summary}</p>
              </div>
              <Button size="sm" className="self-start" onClick={() => onPublish(article)}>
                <Send aria-hidden />
                Publish
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <FileText aria-hidden className="size-5" />
      </span>
      <h3 className="mt-3 text-sm font-semibold">
        {filtered ? "No articles in this view" : "No research results yet"}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {filtered
          ? "Articles with this status will appear here."
          : "Run Research News to collect stories from your enabled sources. Drafts will appear here for review."}
      </p>
    </div>
  );
}
