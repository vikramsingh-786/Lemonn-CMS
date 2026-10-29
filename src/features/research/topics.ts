import "server-only";

/**
 * The 7 topics the CMS covers. A story is kept only if its title or keywords match at least one
 * keyword (case-insensitive, whole words/phrases; a trailing "s"/"es" also matches).
 * Editors: tune the keyword lists here.
 */
export const TOPICS: readonly { name: string; keywords: readonly string[] }[] = [
  {
    name: "Market-moving news",
    keywords: [
      "Sensex",
      "Nifty",
      "stock market",
      "market today",
      "closing bell",
      "opening bell",
      "top gainer",
      "top loser",
      "52-week high",
      "52-week low",
      "shares surge",
      "shares jump",
      "shares fall",
      "shares crash",
      "shares rally",
      "market cap",
    ],
  },
  {
    name: "Company announcements",
    keywords: [
      "Q1 result",
      "Q2 result",
      "Q3 result",
      "Q4 result",
      "quarterly result",
      "net profit",
      "revenue",
      "dividend",
      "bonus issue",
      "stock split",
      "buyback",
      "order win",
      "acquisition",
      "merger",
      "stake sale",
      "board approves",
      "appoints",
      "CEO",
      "resigns",
    ],
  },
  {
    name: "F&O and derivatives",
    keywords: [
      "F&O",
      "futures",
      "options",
      "derivatives",
      "expiry",
      "open interest",
      "put-call ratio",
      "call option",
      "put option",
      "Bank Nifty options",
      "lot size",
    ],
  },
  {
    name: "Regulatory news",
    keywords: [
      "SEBI",
      "RBI",
      "circular",
      "regulator",
      "norms",
      "penalty",
      "MCA",
      "IRDAI",
      "PFRDA",
      "CCI",
      "NCLT",
      "tax rule",
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
      "rupee",
      "dollar",
      "crude oil",
      "bond yield",
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
    keywords: ["mutual fund", "SIP", "NFO", "AMC", "NAV", "ETF", "AMFI", "PMS", "AIF", "gold ETF"],
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

/** URL path sections that are never financial news. */
const OFF_TOPIC_PATH =
  /(?:^|\/)(?:sports?|cricket|entertainment|bollywood|lifestyle|travel|astrology|web-stories|videos?|photos?)(?:\/|$)/i;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const MATCHERS = TOPICS.map((topic) => ({
  name: topic.name,
  regex: new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${topic.keywords.map(escape).join("|")})(?:e?s)?(?![\\p{L}\\p{N}])`,
    "iu",
  ),
}));

/** Topics matched by `text` (title + keywords/snippet); empty when off-topic. */
export function classifyTopics(text: string, url: string): string[] {
  if (OFF_TOPIC_PATH.test(new URL(url).pathname)) return [];
  return MATCHERS.filter((m) => m.regex.test(text)).map((m) => m.name);
}
