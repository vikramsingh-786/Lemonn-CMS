import { ExternalLink, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { NewsSource } from "./data";

type NewsSourcesProps = {
  sources: readonly NewsSource[];
  onToggle: (id: string, enabled: boolean) => void;
  onAddSource: () => void;
};

function displayUrl(url: string) {
  const { host, pathname } = new URL(url);
  return (host.replace(/^www\./, "") + pathname).replace(/\/$/, "");
}

export function NewsSources({ sources, onToggle, onAddSource }: NewsSourcesProps) {
  return (
    <section
      id="sources"
      aria-labelledby="sources-heading"
      className="scroll-mt-28 rounded-lg border border-border bg-card"
    >
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div>
          <h2 id="sources-heading" className="text-base font-semibold">
            Research Sources
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Starting points used to discover recent stock-market and financial news. Only enabled
            sources will be researched.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onAddSource}>
          <Plus aria-hidden />
          Add Source
        </Button>
      </div>

      <ol className="divide-y divide-border">
        {sources.map((source, index) => (
          <li
            key={source.id}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 sm:gap-4 sm:px-5"
          >
            <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{source.name}</p>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex max-w-full items-center gap-1 rounded font-mono text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="truncate">{displayUrl(source.url)}</span>
                <ExternalLink aria-hidden className="size-3 shrink-0" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </div>
            <Badge
              variant={source.enabled ? "success" : "neutral"}
              className="hidden sm:inline-flex"
            >
              <span
                aria-hidden
                className={`size-1.5 rounded-full ${source.enabled ? "bg-success" : "bg-muted-foreground"}`}
              />
              {source.enabled ? "Enabled" : "Disabled"}
            </Badge>
            <Switch
              checked={source.enabled}
              onCheckedChange={(enabled) => onToggle(source.id, enabled)}
              aria-label={`Use ${source.name} for research`}
            />
          </li>
        ))}
      </ol>

      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-5">
        Changes apply to this browser session only and are not saved.
      </p>
    </section>
  );
}
