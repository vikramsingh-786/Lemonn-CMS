import "server-only";

/** Step 4 (clean + rank) weights and patterns. Tune here; rank.ts holds no numbers of its own. */
export const RANK_CONFIG = {
  /** Undated stories more than this far in the future are excluded. */
  futureToleranceMs: 10 * 60_000,
  /** Similar headlines merge only when published this close together. */
  duplicateWindowMs: 12 * 3_600_000,
  /** Jaccard similarity of meaningful headline words needed to merge. */
  duplicateJaccard: 0.6,

  /*
   * Score weights follow the editorial priority, highest max first:
   * announcement (6) > topic (5) > source (4) > coverage (3) > recency (2).
   * Higher signals usually win, but several lower ones together can beat a weak announcement.
   * Penalties are sized to cancel what they guard against, and any penalty also withholds the
   * announcement bonus (a preview or tip about results is not the announcement itself).
   */

  /** Each lead publisher keeps only its best this-many candidates by rules score. */
  perSourceCap: 20,

  /** [max age in hours, points], first match wins. */
  recency: [
    [6, 2],
    [12, 1],
    [24, 0],
  ] as const,

  coveragePerPublisher: 1,
  coverageMax: 3,

  /** Source credibility; also picks the lead report of a duplicate cluster. */
  majorSourceIds: [
    "moneycontrol",
    "et-markets",
    "bs-markets",
    "cnbctv18",
    "mint-markets",
    "reuters-markets",
    "bloomberg-markets",
    "fe-markets",
  ],
  majorPoints: 4,
  otherPoints: 2,

  /** Points for the best topic a candidate has (topic names from topics.ts). */
  topicPoints: {
    "Company announcements": 5,
    "Regulatory news": 5,
    "Market-moving news": 3,
    "Macro and global markets": 3,
    "F&O and derivatives": 3,
    "Funds and investments": 3,
    "Trading education": 0,
  } as Record<string, number>,

  /** Headline signals of an official, verifiable announcement. */
  announcement: {
    points: 6,
    pattern:
      /\bQ[1-4]\s*(?:FY\s?\d{2,4}\s*)?(?:results?|earnings|revenue|net (?:profit|loss)|profit|loss)\b|\b(?:March|June|September|December)[- ]quarter\b|\bnet (?:profit|loss)\b|\bprofit (?:rises?|jumps?|falls?|declines?|drops?|surges?|grows?|doubles)\b|\bdividends?\b|\bbonus\b|\bbuy-?backs?\b|\bstock split\b|\brights issue\b|\brecord date\b|\b(?:bags?|wins?|secures?)\b.{0,40}\border|\border worth\b|\bacquires?\b|\b(?:buys?|sells?|acquires?|picks up)\b.{0,40}\bstake\b|\bboard approves\b|\bappoints?\b|\bresigns?\b|\bU?DRHP\b|\bSEBI\b|\bRBI\b|\bcircular\b|\bpenalty\b|\brepo rate\b/i,
  },

  /** Headline noise; each category counts once. `path` patterns test the URL path. */
  noise: [
    {
      label: "tips",
      points: -6,
      pattern:
        /\bstocks? to buy\b|\bbuy or sell\b|\btarget prices?\b|\b\d+(?:\.\d+)?% upside\b|\bupside (?:potential|target)\b|\btop picks\b|\bmultibaggers?\b/i,
    },
    {
      label: "explainer",
      points: -5,
      pattern: /\bexplained\b|\bwhat is\b|\bhow to\b|\bwho is\b|\svs\.?\s/i,
    },
    { label: "question headline", points: -4, pattern: /\?\s*$/ },
    {
      label: "live/preview",
      points: -3,
      pattern: /\blive updates?\b|\bpreviews?\b|\bwhat to watch\b|\bthings to know\b/i,
    },
    {
      label: "opinion/interview",
      points: -3,
      // Quote-led headline, or "…, says First Last" / "First Last says". Not ": First Last" at the
      // end: Bloomberg's Title Case ("…: Markets Wrap") matched it. ("upside" alone matched
      // "Upside Inflation Risks", so tips need "N% upside".)
      pattern: /^\s*['‘"“]|\bsays [A-Z][a-z]+ [A-Z]|[A-Z][a-z]+ [A-Z][a-z]+ says\b/,
      path: /\/opinions?\//i,
    },
  ],

  /** Not news articles: file links, live quote pages, company profile / CIN pages. */
  nonArticle: {
    path: /\.(?:pdf|xlsx?|csv|zip)$|\/company-profile\/|\/cin\//i,
    title: /\b(?:share|stock) price (?:today|live)\b|\bcompany profile\b|\bCIN\b/i,
  },

  /** Ignored when comparing headlines for duplicates. */
  stopWords: new Set(
    "a an and are as at be by for from has have in into is it its of on or over the to up was were will with after amid as but says said its this that than new over vs".split(
      " ",
    ),
  ),

  /** Query params removed when canonicalising URLs (plus any utm_*). */
  trackingParams: new Set(["fbclid", "gclid", "ref", "ref_src", "mc_cid", "mc_eid"]),

  /** Gemini screen: points added on top of the rule score. */
  gemini: {
    impact: { high: 3, medium: 2, low: 1 },
    verifiable: 4,
  },
} as const;
