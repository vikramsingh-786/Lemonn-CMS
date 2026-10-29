import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { ConfiguredSource } from "@/features/research/types";

type NewsSourcesProps = {
  sources: readonly ConfiguredSource[];
  onToggle: (id: string, enabled: boolean) => void;
  disabled?: boolean;
};

function displayUrl(url: string) {
  const { host, pathname } = new URL(url);
  return (host.replace(/^www\./, "") + pathname).replace(/\/$/, "");
}

export function NewsSources({ sources, onToggle, disabled }: NewsSourcesProps) {
  const enabled = sources.filter((s) => s.enabled).length;

  return (
    <section
      id="sources"
      aria-labelledby="sources-heading"
      className="scroll-mt-28 surface-raised rounded-lg border border-border bg-card"
    >
      <div className="border-b border-border px-5 py-4 sm:px-6 sm:py-5">
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
            {enabled} of {sources.length} enabled
          </p>
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
          </li>
        ))}
      </ol>

      <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground sm:px-6">
        The source list is fixed in this prototype (src/features/dashboard/data.ts). On/off switches
        apply to this browser tab only.
      </p>
    </section>
  );
}
