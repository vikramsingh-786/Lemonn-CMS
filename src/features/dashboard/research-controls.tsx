import { ArrowRight, CircleStop, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ResearchStatus } from "./data";

type ResearchControlsProps = {
  status: ResearchStatus;
  enabledSources: number;
  onResearch: () => void;
  /** Shown while researching: stops the run (the caller confirms first). */
  onCancel?: () => void;
  className?: string;
};

function researchHint(enabledSources: number): string {
  return enabledSources === 0
    ? "Enable at least one source to research."
    : "Discover → rank → verify → draft.";
}

export function ResearchControls({
  status,
  enabledSources,
  onResearch,
  onCancel,
  className,
}: ResearchControlsProps) {
  const running = status === "running";

  return (
    <div className={cn("flex flex-col items-start gap-5 sm:items-end", className)}>
      <Button
        size="lg"
        eyebrow={running ? "Please wait" : "Last 24 hours"}
        className="min-w-60 text-lg"
        onClick={onResearch}
        disabled={running || enabledSources === 0}
        aria-busy={running}
      >
        {running ? (
          <>
            <LoaderCircle aria-hidden className="animate-spin" />
            Researching...
          </>
        ) : (
          <>
            Research News
            <ArrowRight aria-hidden />
          </>
        )}
      </Button>
      {running && onCancel ? (
        <Button variant="outline" size="sm" onClick={onCancel}>
          <CircleStop aria-hidden />
          Cancel research
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">{researchHint(enabledSources)}</p>
      )}
    </div>
  );
}
