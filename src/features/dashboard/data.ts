export type NewsSource = {
  id: string;
  name: string;
  /** Starting URL only — not a feed or extraction endpoint. Research searches this domain via Tavily; it is never crawled. */
  url: string;
  enabled: boolean;
};

/** Domain used for Tavily's include_domains filter, e.g. "economictimes.indiatimes.com". */
export function sourceDomain(source: Pick<NewsSource, "url">): string {
  return new URL(source.url).hostname.replace(/^www\./, "");
}

// ponytail: only 1 source on by default to keep test runs fast and cheap; enable more via the toggles.
export const DEFAULT_SOURCES: readonly NewsSource[] = [
  {
    id: "moneycontrol",
    name: "Moneycontrol",
    url: "https://www.moneycontrol.com/",
    enabled: false,
  },
  {
    id: "et-markets",
    name: "Economic Times Markets",
    url: "https://economictimes.indiatimes.com/markets",
    enabled: false,
  },
  {
    id: "bs-markets",
    name: "Business Standard Markets",
    url: "https://www.business-standard.com/markets",
    enabled: false,
  },
  { id: "cnbctv18", name: "CNBC TV18", url: "https://www.cnbctv18.com/market/", enabled: false },
  {
    id: "mint-markets",
    name: "Mint Markets",
    url: "https://www.livemint.com/market",
    enabled: true,
  },
  {
    id: "reuters-markets",
    name: "Reuters Markets",
    url: "https://www.reuters.com/markets/",
    enabled: false,
  },
  {
    id: "bloomberg-markets",
    name: "Bloomberg Markets",
    url: "https://www.bloomberg.com/markets",
    enabled: false,
  },
  {
    id: "fe-markets",
    name: "Financial Express Markets",
    url: "https://www.financialexpress.com/market/",
    enabled: false,
  },
];

export type ResearchStatus = "idle" | "running" | "done" | "error";

export const RESEARCH_STATUS_LABEL: Record<ResearchStatus, string> = {
  idle: "Not Started",
  running: "Researching…",
  done: "Completed",
  error: "Failed",
};
