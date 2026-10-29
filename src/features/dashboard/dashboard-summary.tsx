import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  FileCheck2,
  Globe,
  LoaderCircle,
} from "lucide-react";
import { RESEARCH_STATUS_LABEL, type ResearchStatus } from "./data";

type DashboardSummaryProps = {
  totalSources: number;
  enabledSources: number;
  researchStatus: ResearchStatus;
  readyToPublish: number;
  draftCount: number;
};

const RESEARCH_ICON = {
  idle: CircleDashed,
  running: LoaderCircle,
  done: CircleCheck,
  error: CircleAlert,
} as const;

const RESEARCH_DETAIL: Record<ResearchStatus, string> = {
  idle: "Searches the last 24 hours",
  running: "Discovering news (last 24h)",
  done: "Saved on this server",
  error: "See the message above",
};

export function DashboardSummary({
  totalSources,
  enabledSources,
  researchStatus,
  readyToPublish,
  draftCount,
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
      detail: RESEARCH_DETAIL[researchStatus],
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
      detail: `${draftCount} verified draft${draftCount === 1 ? "" : "s"} awaiting human review`,
      icon: <FileCheck2 aria-hidden />,
    },
  ];

  const tone: Record<ResearchStatus, string> = {
    idle: "text-foreground",
    running: "text-primary",
    done: "text-success",
    error: "text-destructive",
  };
  const valueTone = ["text-success", tone[researchStatus], "text-foreground"];

  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      {cards.map((card, i) => (
        <div
          key={card.label}
          className="surface-raised flex flex-col gap-2 rounded-3xl bg-card p-2.5"
        >
          <dt className="flex items-center gap-2">
            <span className="pill-raised flex-1 truncate rounded-full bg-muted px-3.5 py-1.5 text-sm text-foreground">
              {card.label}
            </span>
            <span className="pill-raised grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground [&_svg]:size-4">
              {card.icon}
            </span>
          </dt>
          <dd
            className={`pill-inset rounded-full bg-background/60 px-3.5 py-1.5 font-display text-xl font-semibold tracking-tight tabular-nums ${valueTone[i]}`}
          >
            {card.value}
          </dd>
          <dd className="px-3.5 pb-1 text-xs text-muted-foreground">{card.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
