import { Badge } from "@/components/ui/badge";
import type { DiscoveredItem } from "@/features/research/types";
import { formatIst } from "./format";

/** Step 3 output: stories found on the 8 topics. Titles are untrusted and rendered as text. */
export function DiscoveredStories({ items }: { items: readonly DiscoveredItem[] }) {
  return (
    <section
      id="discovered"
      aria-labelledby="discovered-heading"
      className="surface-raised scroll-mt-28 rounded-lg border border-border bg-card"
    >
      <div className="border-b border-border px-5 py-4 sm:px-6 sm:py-5">
        <h2 id="discovered-heading" className="font-display text-lg font-semibold tracking-tight">
          Discovered stories
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Last 24 hours, newest first, max 20 per source. Not yet deduplicated, ranked or verified.
        </p>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground sm:px-6">
          No stories on the 8 topics yet.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.url} className="px-5 py-3.5 text-sm sm:px-6">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {item.title}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="text-foreground">{item.publisher}</span>
                <span>{item.publishedAt ? formatIst(item.publishedAt) : "time unknown"}</span>
                <span>via {item.method === "sitemap" ? "news sitemap" : "Tavily"}</span>
                {item.topics.map((topic) => (
                  <Badge key={topic} variant="outline">
                    {topic}
                  </Badge>
                ))}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
