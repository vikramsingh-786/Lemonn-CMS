export type NewsSource = {
  id: string;
  name: string;
  /** Starting URL only — not a verified feed or extraction endpoint. Never fetched in this phase. */
  url: string;
  enabled: boolean;
};

export const DEFAULT_SOURCES: readonly NewsSource[] = [
  { id: "moneycontrol", name: "Moneycontrol", url: "https://www.moneycontrol.com/", enabled: true },
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
    enabled: true,
  },
  {
    id: "bloomberg-markets",
    name: "Bloomberg Markets",
    url: "https://www.bloomberg.com/markets",
    enabled: true,
  },
  {
    id: "fe-markets",
    name: "Financial Express Markets",
    url: "https://www.financialexpress.com/market/",
    enabled: true,
  },
  { id: "nse", name: "NSE India", url: "https://www.nseindia.com/", enabled: true },
  { id: "bse", name: "BSE India", url: "https://www.bseindia.com/", enabled: true },
];

export type ResearchStatus = "idle" | "running" | "done";

export type ArticleStatus = "draft" | "ready" | "published";

export type Article = {
  id: string;
  title: string;
  summary: string;
  status: ArticleStatus;
  isSample: boolean;
};

/** Shown only after the demo research run. Deliberately contains no market claims. */
export const SAMPLE_ARTICLE: Article = {
  id: "sample-1",
  title: "Sample draft: how a researched article will appear",
  summary:
    "Placeholder content that previews the review card layout. It is not real news, was not generated from any source, and contains no market data.",
  status: "draft",
  isSample: true,
};

export const RESEARCH_STATUS_LABEL: Record<ResearchStatus, string> = {
  idle: "Not Started",
  running: "Researching…",
  done: "Demo Completed",
};

export const ARTICLE_STATUS_LABEL: Record<ArticleStatus, string> = {
  draft: "Draft",
  ready: "Ready to Publish",
  published: "Published",
};
