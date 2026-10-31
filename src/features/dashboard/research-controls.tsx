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
  /** The role can't run research: show who can, instead of the button. */
  readOnly?: boolean;
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
  readOnly = false,
  className,
}: ResearchControlsProps) {
  const running = status === "running";
  if (readOnly)
    return (
      <p
        className={cn(
          "max-w-xs rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground",
          className,
        )}
      >
        Read-only access. Team members and admins run research; ask an admin for access.
      </p>
    );

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
