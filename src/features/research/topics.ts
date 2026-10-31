import "server-only";

/**
 * The 7 topics the CMS covers. A story is kept when its title matches a keyword of at least one
 * topic (whole words/phrases; a trailing "s"/"es" also matches), or when only the publisher's
 * keyword tags / search excerpt match and the story is in a business section (see classifyTopics).
 * Matching ignores case, except for CASE_SENSITIVE keywords that are also everyday words.
 * Keywords are phrases, not loose words: "options", "CEO", "revenue", "rupee" alone matched
 * politics and lifestyle stories in the live sitemaps on 1 Nov 2026 (tests/unit/topics.test.ts).
 * Editors: tune the keyword lists here.
 */
export const TOPICS: readonly { name: string; keywords: readonly string[] }[] = [
  {
    name: "Market-moving news",
    keywords: [
      "Sensex",
      "Nifty",
      "stock market",
      "stocks",
      "stock price",
      "share price",
      "market today",
      "closing bell",
      "opening bell",
      "top gainer",
      "top loser",
      "52-week high",
      "52-week low",
      "shares surge",
      "shares jump",
      "shares rise",
      "shares gain",
      "shares climb",
      "shares soar",
      "shares zoom",
      "shares hit",
      "shares fall",
      "shares drop",
      "shares slump",
      "shares tank",
      "shares decline",
      "shares crash",
      "shares rally",
      "upper circuit",
      "lower circuit",
      "multibagger",
      "investors' money",
      "investors' wealth",
      "market cap",
    ],
  },
  {
    name: "Company announcements",
    keywords: [
      "Q1",
      "Q2",
      "Q3",
      "Q4",
      "quarterly result",
      "H1 result",
      "earnings",
      "net profit",
      "profit rises",
      "profit jumps",
      "profit falls",
      "profit drops",
      "profit doubles",
      "profit declines",
      "revenue rises",
      "revenue up",
      "revenue grows",
      "revenue falls",
      "dividend",
      "bonus issue",
      "stock split",
      "buyback",
      "order win",
      "bags order",
      "order worth",
      "acquires",
      "to acquire",
      "acquisition deal",
      "merger",
      "stake sale",
      "stake in",
      "board approves",
      "rights issue",
      "QIP",
      "funding round",
      "MD and CEO",
      "MD & CEO",
      "new CEO",
      "appoints",
      // Company roles only: "resigns as" matched "minister… resigns as UDP loses…" (1 Nov 2026).
      "resigns as CEO",
      "resigns as MD",
      "resigns as chairman",
      "resigns as director",
      "steps down as CEO",
      "steps down as MD",
      "steps down as chairman",
    ],
  },
  {
    name: "F&O and derivatives",
    keywords: [
      "F&O",
      "futures and options",
      "index futures",
      "stock futures",
      "Nifty futures",
      "derivatives",
      "weekly expiry",
      "monthly expiry",
      "expiry day",
      "open interest",
      "put-call ratio",
      "call option",
      "put option",
      "options trading",
      "Bank Nifty options",
      "lot size",
    ],
  },
  {
    name: "Regulatory news",
    keywords: [
      "SEBI",
      "RBI",
      "SEBI circular",
      "RBI circular",
      "market regulator",
      "banking regulator",
      "insurance regulator",
      "imposes penalty",
      "monetary penalty",
      "KYC norms",
      "listing norms",
      "disclosure norms",
      "MCA",
      "IRDAI",
      "PFRDA",
      "CCI",
      "NCLT",
      "IBBI",
      "insolvency",
      "tax rule",
      "GST",
      "income tax",
      "tax regime",
      "tax demand",
      "windfall tax",
      "tax devolution",
      "capital gains tax",
      "ITR",
      "TDS",
    ],
  },
  {
    name: "Macro and global markets",
    keywords: [
      "GDP",
      "inflation",
      "CPI",
      "WPI",
      "repo rate",
      "Fed",
      "FOMC",
      "rupee falls",
      "rupee rises",
      "rupee gains",
      "rupee slips",
      "rupee settles",
      "rupee closes",
      "rupee opens",
      "against the dollar",
      "dollar index",
      "crude oil",
      "oil prices",
      "Brent",
      "gold price",
      "gold rate",
      "gold rises",
      "gold falls",
      "gold jumps",
      "gold slips",
      "gold tumbles",
      "gold surges",
      "gold hits",
      "silver rises",
      "silver falls",
      "silver jumps",
      "silver tumbles",
      "silver price",
      "silver rate",
      "precious metal",
      "MCX",
      "commodity",
      "commodities",
      "bond yield",
      "treasury yield",
      "bonds rally",
      "bond market",
      "AT1 bond",
      "G-sec",
      "FII",
      "FPI",
      "Wall Street",
      "Nasdaq",
      "Dow Jones",
      "global markets",
    ],
  },
  {
    name: "Funds and investments",
    keywords: [
      "mutual fund",
      "SIP",
      "NFO",
      "AMC",
      "NAV",
      "ETF",
      "AMFI",
      "PMS",
      "AIF",
      "gold ETF",
      "sovereign gold bond",
      "SGB",
      "EPFO",
      "provident fund",
      "PPF",
      "NPS",
      "fixed deposit",
      "FD rate",
    ],
  },
  {
    name: "Trading education",
    keywords: [
      // Generic words ("how to", "explained", "strategy", "guide") matched lifestyle, politics and
      // entertainment stories on 28 Oct 2026, so only finance-anchored phrases are used.
      "how to invest",
      "how to trade",
      "what is a stock",
      "trading strategy",
      "investment strategy",
      "investing guide",
      "trading guide",
      "for beginners",
      "technical analysis",
      "candlestick",
      "RSI",
      "MACD",
      "support and resistance",
    ],
  },
];

/** Keywords that are also everyday words ("fed up", "a sip", "nav bar"): matched as written. */
const CASE_SENSITIVE = new Set(["Fed", "SIP", "NAV", "PMS", "Q1", "Q2", "Q3", "Q4", "ITR"]);

/** URL path sections that are never financial news. */
const OFF_TOPIC_PATH =
  /(?:^|\/)(?:sports?|cricket|football|entertainment|bollywood|movies|tv|music|lifestyle|life|mint-lounge|magazines|fashion|food|travel|astrology|religion|city|cities|education|science|politics|elections|web-stories|videos?|photos?)(?:\/|$)/i;

/**
 * Business sections (any path segment). A story matched only by the publisher's keyword tags or
 * a search excerpt must be in one: tags alone matched live blogs and world news on 1 Nov 2026.
 */
const BUSINESS_PATH =
  /(?:^|\/)(?:markets?|business|companies|company|corporate|economy|economy-policy|policy|industry|money|wealth|personal-finance|mf|mutual-funds?|stocks?|banking|finance|commodities|earnings|results|tax|ipo)(?:\/|$)/i;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pattern = (keywords: readonly string[]) =>
  `(?<![\\p{L}\\p{N}])(?:${keywords.map(escape).join("|")})(?:e?s)?(?![\\p{L}\\p{N}])`;

const MATCHERS = TOPICS.map((topic) => {
  const exact = topic.keywords.filter((k) => CASE_SENSITIVE.has(k));
  const loose = topic.keywords.filter((k) => !CASE_SENSITIVE.has(k));
  const regexes = [new RegExp(pattern(loose), "iu")];
  if (exact.length > 0) regexes.push(new RegExp(pattern(exact), "u"));
  return { name: topic.name, test: (text: string) => regexes.some((r) => r.test(text)) };
});

const topicsIn = (text: string) => {
  const plain = text.replace(/[‘’]/g, "'"); // "investors’ money" as "investors' money"
  return MATCHERS.filter((m) => m.test(plain)).map((m) => m.name);
};

/**
 * Topics of a story; empty when off-topic. `title` decides; `extra` (sitemap keyword tags or a
 * search excerpt) counts only for a story in a business section.
 */
export function classifyTopics(title: string, extra: string, url: string): string[] {
  const path = new URL(url).pathname;
  if (OFF_TOPIC_PATH.test(path)) return [];
  const byTitle = topicsIn(title);
  if (byTitle.length > 0 || !extra || !BUSINESS_PATH.test(path)) return byTitle;
  return topicsIn(`${title}\n${extra}`);
}
