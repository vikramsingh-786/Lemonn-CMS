import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { ConfiguredSource } from "@/features/research/types";
import { MAX_SOURCES } from "@/features/sources/validation";

type NewsSourcesProps = {
  sources: readonly ConfiguredSource[];
  onToggle: (id: string, enabled: boolean) => void;
  onAddSource: () => void;
  onRemove: (source: ConfiguredSource) => void;
  disabled?: boolean;
};

function displayUrl(url: string) {
  const { host, pathname } = new URL(url);
  return (host.replace(/^www\./, "") + pathname).replace(/\/$/, "");
}

export function NewsSources({
  sources,
  onToggle,
  onAddSource,
  onRemove,
  disabled,
}: NewsSourcesProps) {
  const enabled = sources.filter((s) => s.enabled).length;
  const atLimit = sources.length >= MAX_SOURCES;

  return (
    <section
      id="sources"
      aria-labelledby="sources-heading"
      className="scroll-mt-28 surface-raised rounded-lg border border-border bg-card"
    >
      <div className="flex flex-col gap-4 border-b border-border px-5 py-4 sm:px-6 sm:py-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="sources-heading" className="font-display text-lg font-semibold tracking-tight">
            Research Sources
          </h2>
          <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
            Discovery sources for recent stock-market and financial news. Only enabled sources are
            searched. Official evidence (NSE, BSE, SEBI, RBI…) is searched separately during
            verification.
          </p>
          <p className="mt-2 text-xs font-medium tabular-nums">
            {enabled} enabled · {sources.length} of {MAX_SOURCES} configured
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
          <Button variant="outline" onClick={onAddSource} disabled={atLimit || disabled}>
            <Plus aria-hidden />
            Add Source
          </Button>
          {atLimit && (
            <p className="text-xs text-muted-foreground">
              Maximum of {MAX_SOURCES} reached. Remove one to add another.
            </p>
          )}
        </div>
      </div>

      <ol className="divide-y divide-border">
        {sources.map((source, index) => (
          <li
            key={source.id}
            className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/50 sm:gap-4 sm:px-6"
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
                className="group inline-flex max-w-full items-center gap-1 rounded font-mono text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
              onCheckedChange={(value) => onToggle(source.id, value)}
              aria-label={`Use ${source.name} for research`}
              disabled={disabled}
            />
            <Button
              variant="ghost"
              size="sm"
              className="px-2"
              onClick={() => onRemove(source)}
              disabled={disabled}
              aria-label={`Remove ${source.name}`}
            >
              <Trash2 aria-hidden />
            </Button>
          </li>
        ))}
      </ol>

      <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground sm:px-6">
        Sources are kept in server memory for this prototype and reset when the server restarts.
        On/off switches apply to this browser tab only.
      </p>
    </section>
  );
}
