export type NewsSource = {
  id: string;
  name: string;
  /** Starting URL only — not a feed or extraction endpoint. Research searches this domain via Tavily; it is never crawled. */
  url: string;
  /** On by default when an admin hasn't chosen (admins choose on /admin/sources). */
  enabled: boolean;
  /** Why an editor might leave it off, shown beside the switch. */
  note?: string;
};

/** Domain used for Tavily's include_domains filter, e.g. "economictimes.indiatimes.com". */
export function sourceDomain(source: Pick<NewsSource, "url">): string {
  return new URL(source.url).hostname.replace(/^www\./, "");
}

// Indian publishers with a news sitemap are on by default (discovery is free); see each note.
export const DEFAULT_SOURCES: readonly NewsSource[] = [
  {
    id: "moneycontrol",
    name: "Moneycontrol",
    url: "https://www.moneycontrol.com/",
    enabled: true,
  },
  {
    id: "et-markets",
    name: "Economic Times Markets",
    url: "https://economictimes.indiatimes.com/markets",
    enabled: true,
  },
  {
    id: "bs-markets",
    name: "Business Standard Markets",
    url: "https://www.business-standard.com/markets",
    enabled: true,
  },
  { id: "cnbctv18", name: "CNBC TV18", url: "https://www.cnbctv18.com/market/", enabled: true },
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
    note: "No news sitemap: every run spends a paid Tavily search on it, and undated results are dropped.",
  },
  {
    id: "bloomberg-markets",
    name: "Bloomberg Markets",
    url: "https://www.bloomberg.com/markets",
    enabled: false,
    note: "Global news, so few stories are about Indian markets (2 of 52 on 1 Nov 2026), and it is paywalled, so verification can't read its articles.",
  },
  {
    id: "fe-markets",
    name: "Financial Express Markets",
    url: "https://www.financialexpress.com/market/",
    enabled: true,
  },
];

export type ResearchStatus = "idle" | "running" | "done" | "error" | "cancelled";

export const RESEARCH_STATUS_LABEL: Record<ResearchStatus, string> = {
  idle: "Not Started",
  running: "Researching…",
  done: "Completed",
  error: "Failed",
  cancelled: "Cancelled",
};
