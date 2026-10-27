import { LoaderCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ResearchStatus } from "./data";

type ResearchControlsProps = {
  status: ResearchStatus;
  enabledSources: number;
  onResearch: () => void;
};

export function ResearchControls({ status, enabledSources, onResearch }: ResearchControlsProps) {
  const running = status === "running";

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <Button
        size="lg"
        onClick={onResearch}
        disabled={running || enabledSources === 0}
        aria-busy={running}
      >
        {running ? <LoaderCircle aria-hidden className="animate-spin" /> : <Search aria-hidden />}
        {running ? "Researching..." : "Research News"}
      </Button>
      <p className="text-xs text-muted-foreground">
        {enabledSources === 0
          ? "Enable at least one source to research."
          : "Demo only: no websites are fetched."}
      </p>
    </div>
  );
}
