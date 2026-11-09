/**
 * Deterministic figure checks: does an official text contain a claim's number/date/unit?
 * Pure functions (no I/O) so the gate's decisions are reproducible and testable.
 */

export type FigureCheck = { found: boolean; note: string };

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const MONTH_RE = MONTHS.map((m) => `${m}|${m.slice(0, 3)}${m === "september" ? "t?" : ""}`).join(
  "|",
);

/** Unit families and their value in crore (Indian reports mix crore, lakh, million and billion). */
const UNIT_IN_CRORE: Record<string, number> = {
  // Compound units first: "₹1.2 lakh crore" is 1,20,000 crore, not 1.2 crore.
  "lakh crore": 100_000,
  "thousand crore": 1_000,
  trillion: 100_000,
  crore: 1,
  lakh: 0.01,
  million: 0.1,
  billion: 100,
  thousand: 0.0001,
};
const UNIT_WORDS: Record<string, string> = {
  "lakh crore": "(?:lakhs?|lacs?)\\s*(?:crores?|cr\\.?)",
  "thousand crore": "thousand\\s*(?:crores?|cr\\.?)",
  trillion: "trillions?|tn",
  crore: "crores?|cr\\.?",
  lakh: "lakhs?|lacs?",
  million: "millions?|mn|mln",
  billion: "billions?|bn",
  thousand: "thousands?|'?000s?",
};
/** A simple unit followed by crore is part of a compound unit ("1.2 lakh crore" is not 1.2 lakh). */
const NOT_COMPOUND = "(?!\\s*(?:crores?|cr\\.?)(?![\\p{L}]))";

export type Currency = "INR" | "USD" | "EUR" | "GBP" | "JPY";
const CURRENCIES: [Currency, RegExp][] = [
  ["USD", /us\$|\$|\busd\b|\bdollars?\b/i],
  ["INR", /₹|\brs\b\.?|\binr\b|\brupees?\b/i],
  ["EUR", /€|\beur\b|\beuros?\b/i],
  ["GBP", /£|\bgbp\b|\bpounds?\b/i],
  ["JPY", /¥|\bjpy\b|\byen\b/i],
];

/** The currency a figure or a snippet of text names, if any. */
export function currencyOf(s: string): Currency | null {
  return CURRENCIES.find(([, re]) => re.test(s))?.[0] ?? null;
}

/**
 * Currency written right next to the number at `pos` (just before it, or in the two words after
 * it: "Rs 100 million", "100 million dollars"); null when none is written there.
 */
function currencyAt(text: string, pos: number): Currency | null {
  const before =
    text
      .slice(Math.max(0, pos - 12), pos)
      .match(/(?:us\$|[$₹€£¥]|\b(?:rs|inr|usd|eur|gbp)\b\.?)\s*$/i)?.[0] ?? "";
  const after = (text.slice(pos).match(/^[\d,.]+\s*(?:[\p{L}]+\.?\s*){0,2}/u)?.[0] ?? "").replace(
    /^[\d,.]+/,
    "",
  );
  return currencyOf(before) ?? currencyOf(after);
}

export function unitOf(s: string): string | null {
  for (const [unit, words] of Object.entries(UNIT_WORDS)) {
    if (new RegExp(`(?<![\\p{L}])(?:${words})(?![\\p{L}])`, "iu").test(s)) return unit;
  }
  return null;
}

/** Comma-insensitive number pattern: "1377" matches "1,377" and "1,37,7"; decimals exact. */
function numberPattern(value: string): string {
  const [int, dec] = value.replace(/,/g, "").split(".");
  const body = [...int!].join(",?");
  return `(?<![\\d.,])${body}${dec ? `\\.${dec}` : ""}(?![\\d]|\\.\\d)`;
}

function has(text: string, pattern: string): boolean {
  return new RegExp(pattern, "iu").test(text);
}

/** Date-like figure → patterns for the common ways filings write it; null if not a date. */
function datePatterns(figure: string): string[] | null {
  const f = figure
    .toLowerCase()
    .replace(/(\d)(st|nd|rd|th)\b/g, "$1")
    .replace(/,/g, " ");
  const monthIdx = MONTHS.findIndex((m) => new RegExp(`\\b(?:${m}|${m.slice(0, 3)})\\b`).test(f));
  const fy = f.match(/fy\s?'?(\d{2,4})\b/);
  const quarter = f.match(/\bq([1-4])(?=\s*fy|\b)/);
  const span = f.match(/\b(20\d{2})\s*[-–/]\s*(\d{2,4})\b/);

  if (quarter && fy) {
    const yy = fy[1]!.slice(-2);
    return [`q${quarter[1]}\\s*(?:fy\\s*'?(?:20)?${yy})`, `q${quarter[1]}\\s*(?:20)?${yy}`];
  }
  if (span) {
    const [, a, b] = span;
    const bb = b!.slice(-2);
    return [`${a}\\s*[-–/]\\s*(?:20)?${bb}`, `fy\\s*'?(?:20)?${bb}`];
  }
  if (fy && monthIdx < 0) {
    const yy = fy[1]!.slice(-2);
    return [`fy\\s*'?(?:20)?${yy}`, `20${Number(yy) - 1}\\s*[-–/]\\s*(?:20)?${yy}`];
  }
  if (monthIdx < 0) return null;

  const month = `(?:${MONTHS[monthIdx]}|${MONTHS[monthIdx]!.slice(0, 3)}\\.?${monthIdx === 8 ? "|sept\\.?" : ""})`;
  const day = f.match(/\b(\d{1,2})\b(?!\d)/)?.[1];
  const year = f.match(/\b(20\d{2})\b/)?.[1];
  const ord = "(?:st|nd|rd|th)?";
  if (!day) return year ? [`${month}\\s*,?\\s*${year}`] : [`\\b${month}\\b`];
  const d = Number(day);
  const mm = String(monthIdx + 1).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  const patterns = [
    `(?<!\\d)0?${d}${ord}\\s*(?:of\\s+)?${month}${year ? `\\s*,?\\s*${year}` : ""}`,
    `${month}\\s*0?${d}${ord}${year ? `\\s*,?\\s*${year}` : ""}(?!\\d)`,
  ];
  if (year) patterns.push(`(?<!\\d)${dd}[./-]${mm}[./-]${year}`, `(?<!\\d)${year}-${mm}-${dd}`);
  return patterns;
}

/**
 * Is `figure` (as written in the claim) present in `text`?
 * - Dates: matched across formats ("2 December 2026", "December 2, 2026", "02.12.2026").
 * - Percent: the number must be followed by % / per cent; percentage points need pp/bps wording.
 * - Amounts with a unit: the number next to the same unit, or the exact conversion
 *   (₹1,377 crore = 13,770 million = 1,37,700 lakh), or the bare number when the text states the
 *   unit elsewhere (filing tables say "Rs. in crore" once in the header).
 * - Anything else: every number present (commas ignored), or the words case-insensitively.
 * `siblings`: the claim's other figures. A percent change missing from the text still counts when
 * it computes from one of the claim's amounts and a comparison value next to it (see below).
 */
export function checkFigure(
  figure: string,
  text: string,
  siblings: readonly string[] = [],
): FigureCheck {
  const dates = datePatterns(figure);
  if (dates) {
    return dates.some((p) => has(text, p))
      ? { found: true, note: "" }
      : { found: false, note: `date "${figure}" not found` };
  }

  const numbers = figure.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  if (numbers.length === 0) {
    return text.toLowerCase().includes(figure.toLowerCase().trim())
      ? { found: true, note: "" }
      : { found: false, note: `"${figure}" not found` };
  }

  const isPoints = /\b(?:pp|percentage points?|bps|basis points?)\b/i.test(figure);
  const isPercent = !isPoints && /%|per\s?cent/i.test(figure);
  const unit = unitOf(figure);
  const currency = isPercent || isPoints ? null : currencyOf(figure);

  for (const [i, raw] of numbers.entries()) {
    const num = numberPattern(raw);
    const last = i === numbers.length - 1;
    if (isPoints && last) {
      if (!has(text, `${num}\\s*(?:pp|percentage points?|bps|basis points?)`))
        return { found: false, note: `"${figure}" (percentage points) not found` };
      continue;
    }
    if (isPercent && last) {
      if (!has(text, `${num}\\s*(?:%|per\\s?cent(?!age))`) && !derivedPercent(raw, siblings, text))
        return { found: false, note: `"${raw}%" not found` };
      continue;
    }
    if (unit && last) {
      if (amountFound(raw, unit, text, currency)) continue;
      return {
        found: false,
        note: `"${figure}" not found in the same ${currency ? "currency and " : ""}unit or a conversion (to the claim's rounding)`,
      };
    }
    const occurrences = [...text.matchAll(new RegExp(num, "giu"))];
    if (occurrences.length === 0) return { found: false, note: `"${raw}" not found` };
    if (
      currency &&
      last &&
      !occurrences.some((m) => sameCurrency(currency, currencyAt(text, m.index)))
    )
      return { found: false, note: `"${figure}" not found in ${currency}` };
  }
  return { found: true, note: "" };
}

/** Characters around an amount in which its comparison value must appear (same table row). */
const ROW_CHARS = 250;

/**
 * An amount in every unit family, with how far a printed number may be from it and still be the
 * same figure rounded: "₹63.33 crore" (±0.005 crore) is 633.3 million (±0.05), so a filing's
 * "633.27" in "Rs. millions" matches (Quality Power, 31 Oct 2026). The claim's decimals set the
 * tolerance; the number is never looser than that.
 */
export function amountConversions(
  raw: string,
  unit: string,
): { unit: string; value: number; tolerance: number }[] {
  const decimals = raw.split(".")[1]?.length ?? 0;
  const inCrore = Number(raw.replace(/,/g, "")) * UNIT_IN_CRORE[unit]!;
  const toleranceInCrore = (0.5 / 10 ** decimals) * UNIT_IN_CRORE[unit]!;
  return Object.entries(UNIT_IN_CRORE).map(([other, factor]) => ({
    unit: other,
    value: inCrore / factor,
    tolerance: toleranceInCrore / factor + 1e-9,
  }));
}

/** Positions of numbers in `text` within `tolerance` of `value` (commas ignored). */
export function numbersNear(text: string, value: number, tolerance: number): number[] {
  const found: number[] = [];
  for (const m of text.matchAll(/(?<![\d.,])\d[\d,]*(?:\.\d+)?(?!\d)/g)) {
    if (Math.abs(Number(m[0].replace(/,/g, "")) - value) <= tolerance) found.push(m.index);
  }
  return found;
}

/** A claim's currency and a currency written in the text agree (either may be unstated). */
const sameCurrency = (claim: Currency | null, found: Currency | null) =>
  !claim || !found || claim === found;

/**
 * The currencies of the text's unit statements for `unit` ("(Rs. in Crores)" → INR,
 * "Amt in USD millions" → USD, "(in crore)" → null). Empty when the text states no such unit.
 */
function declaredUnitCurrencies(text: string, unit: string): (Currency | null)[] {
  const re = new RegExp(
    `(?:\\bin|₹|\\brs\\.?|\\binr|\\busd|us\\$|\\$)\\s*(?:(?:rs\\.?|₹|inr|usd|us\\$|\\$)\\s*)?(?:${UNIT_WORDS[unit]})(?![\\p{L}])${unit === "lakh" || unit === "thousand" ? NOT_COMPOUND : ""}`,
    "giu",
  );
  return [...text.matchAll(re)].map((m) =>
    currencyOf(text.slice(Math.max(0, m.index - 15), m.index + m[0].length)),
  );
}

/**
 * A bare number that sits in a table row: the next thing after it is another number, a bracket or
 * the end, or the thing before it is a number. "Employees: 1,377 persons" is not a table figure.
 */
function inTableRow(text: string, pos: number): boolean {
  const len = text.slice(pos).match(/^\d[\d,]*(?:\.\d+)?/)?.[0].length ?? 0;
  const next = text.slice(pos + len).match(/^\s*(\S)/)?.[1];
  if (next === undefined || /[\d(\-–|]/.test(next)) return true;
  const prev = text.slice(0, pos).match(/(\S+)\s*$/)?.[1] ?? "";
  return /[\d)]$/.test(prev);
}

/**
 * Reporters often state a change the filing does not print ("profit up 126%"). It counts only when
 * one of the claim's amounts appears in the text and a number within ROW_CHARS of it gives exactly
 * that change, to the claim's rounding. Kept local so a 600k-character filing can't match by chance.
 */
function derivedPercent(raw: string, siblings: readonly string[], text: string): boolean {
  const p = Number(raw.replace(/,/g, ""));
  const decimals = raw.split(".")[1]?.length ?? 0;
  const tolerance = 0.5 / 10 ** decimals;
  for (const sibling of siblings) {
    const unit = unitOf(sibling);
    const amount = sibling.match(/\d[\d,]*(?:\.\d+)?/)?.[0];
    if (!unit || !amount) continue;
    for (const v of amountConversions(amount, unit)) {
      for (const pos of numbersNear(text, v.value, v.tolerance)) {
        const here = Number(
          text
            .slice(pos)
            .match(/\d[\d,]*(?:\.\d+)?/)![0]
            .replace(/,/g, ""),
        );
        const row = text.slice(Math.max(0, pos - ROW_CHARS), pos + ROW_CHARS);
        for (const n of row.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) {
          const base = Number(n.replace(/,/g, ""));
          if (!(base > 0) || base === here) continue;
          const change = Math.abs(here / base - 1) * 100;
          if (Math.abs(change - p) <= tolerance) return true;
        }
      }
    }
  }
  return false;
}

/**
 * The amount next to its unit word in any unit family ("1,377 crore", "Rs 13,770 mn"), or as a
 * bare number in a text that declares that unit (filing tables state it once in the header);
 * rounding to the claim's precision allowed either way.
 */
function amountFound(raw: string, unit: string, text: string, currency: Currency | null): boolean {
  for (const v of amountConversions(raw, unit)) {
    // Only occurrences whose written currency (if any) is the claim's: "$100 million" ≠ "Rs 100 million".
    const near = numbersNear(text, v.value, v.tolerance).filter((pos) =>
      sameCurrency(currency, currencyAt(text, pos)),
    );
    if (near.length === 0) continue;
    const simple = v.unit === "lakh" || v.unit === "thousand" ? NOT_COMPOUND : "";
    const unitAfter = new RegExp(
      `^[\\d,.]+\\s*(?:${UNIT_WORDS[v.unit]})(?![\\p{L}])${simple}`,
      "iu",
    );
    if (near.some((pos) => unitAfter.test(text.slice(pos, pos + 40)))) return true;
    // A bare number counts only in a table row of a text that states this unit in the claim's currency.
    const declared = declaredUnitCurrencies(text, v.unit);
    if (
      declared.some((c) => sameCurrency(currency, c)) &&
      near.some((pos) => inTableRow(text, pos))
    )
      return true;
  }
  return false;
}

/** Deal stage words, strongest first. Boilerplate ("signed", "approval") alone is not a stage. */
const STAGES: [string, RegExp][] = [
  ["cancelled", /\b(?:cancel+ed|terminated|withdrawn|called off)\b/i],
  [
    "completed",
    /\b(?:completed|completion of|consummated|closed the (?:acquisition|deal|transaction))\b/i,
  ],
  [
    "approved",
    /\b(?:approved|sanctioned|(?:accorded|granted|received)\s+(?:its\s+|the\s+)?(?:\w+\s+)?approval)\b/i,
  ],
  [
    "announced",
    /\b(?:announced?|entered into|(?:signed|executed)\s+(?:an?|the)\s+(?:[\w-]+\s+){0,3}(?:agreement|deal|mou|memorandum|term sheet|contract))\b/i,
  ],
  ["proposed", /\b(?:proposed?|proposal|exploring|considering|in talks|evaluat(?:e|ing))\b/i],
];

/** Words that make a stage word mean the opposite or the future ("not yet approved", "to be completed"). */
const NEGATED_BEFORE =
  /\b(?:not|no|never|yet to|pending|awaiting|subject to|expected to|likely to|set to|proposes? to|plans? to|intends? to|seeks? to|to be|will(?: be)?|would(?: be)?|may(?: be)?|could(?: be)?|shall(?: be)?)\s+(?:[\w-]+\s+){0,2}$/i;
const NEGATED_AFTER =
  /^[^\w.]*(?:(?:is|was|are|has|have|remains?)\s+)?(?:not|pending|awaited|yet to)\b/i;

/** Does the official text state the claim's deal stage as a fact? "not_applicable" always passes. */
export function stageSupported(stage: string, text: string): FigureCheck {
  if (stage === "not_applicable") return { found: true, note: "" };
  const pattern = STAGES.find(([s]) => s === stage)?.[1];
  if (!pattern) return { found: true, note: "" };
  for (const m of text.matchAll(new RegExp(pattern.source, "gi"))) {
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 25);
    if (!NEGATED_BEFORE.test(before) && !NEGATED_AFTER.test(after))
      return { found: true, note: "" };
  }
  return {
    found: false,
    note: `the deal stage "${stage}" is not stated as a fact in the official text`,
  };
}

/** Quarter-end month (0-based) and calendar year of "Q2 FY27" / "Q2FY2027"; null if not stated. */
function claimedQuarterEnd(claim: string): { month: number; year: number } | null {
  const m = claim.match(/\bQ([1-4])\s*-?\s*FY\s*'?(\d{2}|\d{4})\b/i);
  if (!m) return null;
  const q = Number(m[1]);
  const fy = Number(m[2]!.length === 2 ? `20${m[2]}` : m[2]);
  // Indian fiscal year FY27 = April 2026 – March 2027: Q1 ends June 2026 … Q4 ends March 2027.
  return q === 4 ? { month: 2, year: fy } : { month: [5, 8, 11][q - 1]!, year: fy - 1 };
}

/**
 * Reporting basis and period: a claim about "standalone" figures can't be confirmed by a text that
 * is only consolidated (and vice versa), and a claim about Q2 FY27 can't be confirmed by a text whose
 * "quarter ended …" dates are all for other quarters. Silent when the text doesn't say.
 */
export function basisAndPeriod(claim: string, text: string): FigureCheck {
  const notes: string[] = [];
  const has = (w: string) => new RegExp(`\\b${w}\\b`, "i").test(text);
  const basis = /\bstandalone\b/i.test(claim)
    ? "standalone"
    : /\bconsolidated\b/i.test(claim)
      ? "consolidated"
      : null;
  if (basis) {
    const other = basis === "standalone" ? "consolidated" : "standalone";
    if (has(other) && !has(basis))
      notes.push(`the official text is ${other}, the claim is ${basis}`);
  }
  const period = claimedQuarterEnd(claim);
  if (period) {
    const ended = [
      ...text.matchAll(
        new RegExp(
          `\\bquarter\\s+ended\\s+(?:on\\s+)?(?:\\d{1,2}(?:st|nd|rd|th)?\\s*)?(${MONTH_RE})\\.?[,\\s]+(?:\\d{1,2}(?:st|nd|rd|th)?,?\\s*)?(20\\d{2})`,
          "gi",
        ),
      ),
    ].map((m) => ({
      month: MONTHS.findIndex((x) => m[1]!.toLowerCase().startsWith(x.slice(0, 3))),
      year: Number(m[2]),
    }));
    if (ended.length > 0 && !ended.some((e) => e.month === period.month && e.year === period.year))
      notes.push("the official text covers a different quarter than the claim");
  }
  return { found: notes.length === 0, note: notes.join("; ") };
}

/** Year-month a URL path or date string points to, e.g. ".../nov-2018/..." → 2018-11. */
export function dateHint(url: string, publishedAt: string | null, text = ""): Date | null {
  if (publishedAt) {
    const d = new Date(publishedAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const monthIndex = (name: string) => MONTHS.findIndex((x) => name.startsWith(x.slice(0, 3)));
  const m = url.toLowerCase().match(new RegExp(`/(${MONTH_RE})-(20\\d{2})/`));
  if (m) return new Date(Date.UTC(Number(m[2]), monthIndex(m[1]!), 1));
  // NSE filing names carry the filing time: SYMBOL_DDMMYYYYhhmmss_….pdf
  const nse = url.match(/_(\d{2})(\d{2})(20\d{2})\d{6}_/);
  if (nse) return new Date(Date.UTC(Number(nse[3]), Number(nse[2]) - 1, Number(nse[1])));
  // A filing's letter date in its opening lines: "7th November 2025" or "November 7, 2025".
  const head = text.slice(0, 600).toLowerCase();
  const dmy = head.match(
    new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})\\.?,?\\s+(20\\d{2})\\b`),
  );
  if (dmy) return new Date(Date.UTC(Number(dmy[3]), monthIndex(dmy[2]!), Number(dmy[1])));
  const mdy = head.match(
    new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})\\b`),
  );
  if (mdy) return new Date(Date.UTC(Number(mdy[3]), monthIndex(mdy[1]!), Number(mdy[2])));
  return null;
}
