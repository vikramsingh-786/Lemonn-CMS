"use client";

import { Clock, ExternalLink, Newspaper, Search } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  CandidateReport,
  DiscoveryMethod,
  ExcludedItem,
  ResearchRun,
} from "@/features/research/types";
import { formatIst } from "./format";
import { SourceLink } from "./status";

/** Cards shown before "Show all", so a 100+ story run doesn't push the rest of the page away. */
const INITIAL_CARDS = 12;

const EXCLUSION_LABEL: Record<ExcludedItem["reason"], string> = {
  timestamp_unverified: "No publication time",
  future_dated: "Future-dated",
  out_of_window: "Outside 24h window",
  not_an_article: "Not an article",
  irrelevant: "Not relevant (AI screen)",
};

type Story = {
  key: string;
  url: string;
  title: string;
  publisher: string;
  publishedAt: string | null;
  topics: string[];
  method: DiscoveryMethod | undefined;
  /** Present once Step 4 has ranked the run. */
  ranked?: Pick<CandidateReport, "rank" | "score" | "rankReasons" | "otherReports" | "screenedBy">;
};

/**
 * Steps 3–4 output in one list: discovered stories while discovery runs, then the ranked,
 * de-duplicated candidates. Titles and reasons are untrusted and rendered as text.
 */
export function DiscoveredStories({ run }: { run: ResearchRun }) {
  const [showAll, setShowAll] = useState(false);
  const isRanked = run.stage !== "discovering" && run.stage !== "ranking";
  const methodByUrl = new Map(run.items.map((i) => [i.url, i.method]));

  const stories: Story[] = isRanked
    ? run.candidates.map((c) => ({
        key: c.id,
        url: c.url,
        title: c.headline,
        publisher: c.publisher,
        publishedAt: c.publishedAt,
        topics: c.topics,
        method: methodByUrl.get(c.url),
        ranked: c,
      }))
    : run.items.map((i) => ({ ...i, key: i.url }));
  const visible = showAll ? stories : stories.slice(0, INITIAL_CARDS);

  return (
    <section
      id="discovered"
      aria-labelledby="discovered-heading"
      className="surface-raised scroll-mt-28 rounded-lg border border-border bg-card"
    >
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border px-5 py-4 sm:px-6 sm:py-5">
        <div>
          <h2 id="discovered-heading" className="font-display text-lg font-semibold tracking-tight">
            Discovered stories
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {isRanked
              ? "Ranked by score, highest first, after merging duplicates and removing non-articles. Not verified yet."
              : "Last 24 hours, newest first, max 20 per source. Ranking starts when discovery finishes."}
          </p>
        </div>
        {stories.length > 0 && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {stories.length}{" "}
            {isRanked
              ? stories.length === 1
                ? "candidate"
                : "candidates"
              : stories.length === 1
                ? "story"
                : "stories"}
            {isRanked && ` from ${run.items.length} discovered`}
          </span>
        )}
      </div>

      {stories.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground sm:px-6">
          No stories on the 8 topics yet.
        </p>
      ) : (
        <div className="p-4 sm:p-5">
          <ul className="grid gap-3 sm:grid-cols-2">
            {visible.map((story) => (
              <StoryCard key={story.key} story={story} />
            ))}
          </ul>
          {stories.length > INITIAL_CARDS && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                aria-expanded={showAll}
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? "Show fewer" : `Show all ${stories.length}`}
              </Button>
            </div>
          )}
        </div>
      )}

      {isRanked && run.excluded.length > 0 && (
        <details className="border-t border-border px-5 py-4 text-sm sm:px-6">
          <summary className="rounded font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            Excluded items and why ({run.excluded.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-2 text-xs">
            {run.excluded.map((e) => (
              <li key={`${e.reason}:${e.url}`} className="rounded-2xl bg-muted px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="neutral">{EXCLUSION_LABEL[e.reason]}</Badge>
                  <span>{e.publisher}</span>
                </div>
                <p className="mt-1 flex min-w-0">
                  <SourceLink href={e.url}>{e.title}</SourceLink>
                </p>
                <p className="mt-0.5 text-muted-foreground">{e.detail}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function StoryCard({ story }: { story: Story }) {
  const MethodIcon = story.method === "tavily" ? Search : Newspaper;
  const { ranked } = story;
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-background/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-2">
          {ranked && <span className="font-mono text-muted-foreground">#{ranked.rank}</span>}
          <span className="pill-raised rounded-full bg-muted px-3 py-1 font-medium text-foreground">
            {story.publisher}
          </span>
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Clock aria-hidden className="size-3.5" />
          {story.publishedAt ? formatIst(story.publishedAt) : "Time unknown"}
        </span>
      </div>

      <p className="line-clamp-3 text-sm leading-snug font-medium">{story.title}</p>

      {story.topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {story.topics.map((topic) => (
            <Badge key={topic} variant="outline">
              {topic}
            </Badge>
          ))}
        </div>
      )}

      {ranked && (
        <details className="text-xs">
          <summary className="flex cursor-pointer flex-wrap items-center gap-2 rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <Badge variant="success">Score {ranked.score}</Badge>
            <span className="text-muted-foreground">
              {ranked.screenedBy === "rules" ? "Rules only" : "Rules + Gemini"}
              {ranked.otherReports.length > 0 &&
                ` · also reported by ${ranked.otherReports.length}`}
            </span>
            <span className="font-medium hover:underline">Why?</span>
          </summary>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted-foreground">
            {ranked.rankReasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
          {ranked.otherReports.length > 0 && (
            <>
              <p className="mt-2 font-medium">Also reported by</p>
              <ul className="mt-1 flex flex-col gap-1">
                {ranked.otherReports.map((r) => (
                  <li key={r.url} className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0">{r.publisher}</span>
                    <SourceLink href={r.url}>{r.title}</SourceLink>
                  </li>
                ))}
              </ul>
            </>
          )}
        </details>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <MethodIcon aria-hidden className="size-3.5" />
          via {story.method === "tavily" ? "Tavily" : "news sitemap"}
        </span>
        <a
          href={story.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded font-medium text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Read article
          <ExternalLink aria-hidden className="size-3.5" />
          <span className="sr-only"> (opens in a new tab): {story.title}</span>
        </a>
      </div>
    </li>
  );
}
