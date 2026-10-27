import { CircleDashed, CircleCheck, Globe, LoaderCircle, FileCheck2 } from "lucide-react";
import { RESEARCH_STATUS_LABEL, type ResearchStatus } from "./data";

type DashboardSummaryProps = {
  totalSources: number;
  enabledSources: number;
  researchStatus: ResearchStatus;
  readyToPublish: number;
};

const RESEARCH_ICON = { idle: CircleDashed, running: LoaderCircle, done: CircleCheck } as const;

export function DashboardSummary({
  totalSources,
  enabledSources,
  researchStatus,
  readyToPublish,
}: DashboardSummaryProps) {
  const ResearchIcon = RESEARCH_ICON[researchStatus];
  const cards = [
    {
      label: "Total Sources",
      value: String(totalSources),
      detail: `${enabledSources} enabled`,
      icon: <Globe aria-hidden />,
    },
    {
      label: "Research Status",
      value: RESEARCH_STATUS_LABEL[researchStatus],
      detail: researchStatus === "done" ? "Simulated run, no data fetched" : "Demo mode",
      icon: (
        <ResearchIcon
          aria-hidden
          className={researchStatus === "running" ? "animate-spin" : undefined}
        />
      ),
    },
    {
      label: "Articles Ready to Publish",
      value: String(readyToPublish),
      detail: "Awaiting review",
      icon: <FileCheck2 aria-hidden />,
    },
  ];

  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border border-border bg-card p-4">
          <dt className="flex items-center justify-between text-xs font-medium text-muted-foreground [&_svg]:size-4">
            {card.label}
            {card.icon}
          </dt>
          <dd className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{card.value}</dd>
          <dd className="mt-0.5 text-xs text-muted-foreground">{card.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
