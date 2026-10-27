import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ResearchStatus } from "./data";

type ResearchControlsProps = {
  status: ResearchStatus;
  enabledSources: number;
  onResearch: () => void;
  className?: string;
};

export function researchHint(enabledSources: number): string {
  return enabledSources === 0
    ? "Enable at least one source to research."
    : "Tavily search → evidence → Gemini verification → drafts.";
}

export function ResearchControls({
  status,
  enabledSources,
  onResearch,
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
      <p className="text-xs text-muted-foreground">{researchHint(enabledSources)}</p>
    </div>
  );
}
