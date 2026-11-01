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
  crore: 1,
  lakh: 0.01,
  million: 0.1,
  billion: 100,
  thousand: 0.0001,
};
const UNIT_WORDS: Record<string, string> = {
  crore: "crores?|cr\\.?",
  lakh: "lakhs?|lacs?",
  million: "millions?|mn|mln",
  billion: "billions?|bn",
  thousand: "thousands?|'?000s?",
};

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
      if (amountFound(raw, unit, text)) continue;
      return {
        found: false,
        note: `"${figure}" not found in the same unit or a conversion (to the claim's rounding)`,
      };
    }
    if (!has(text, num)) return { found: false, note: `"${raw}" not found` };
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

/** The text says its amounts are in this unit ("(Rs. in Crores)", "Amt in Rs. millions"). */
const declaresUnit = (text: string, unit: string) =>
  has(text, `(?:in|₹|rs\\.?|inr)\\s*(?:${UNIT_WORDS[unit]})(?![\\p{L}])`);

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
function amountFound(raw: string, unit: string, text: string): boolean {
  for (const v of amountConversions(raw, unit)) {
    const near = numbersNear(text, v.value, v.tolerance);
    if (near.length === 0) continue;
    const unitAfter = new RegExp(`^[\\d,.]+\\s*(?:${UNIT_WORDS[v.unit]})(?![\\p{L}])`, "iu");
    if (near.some((pos) => unitAfter.test(text.slice(pos, pos + 40)))) return true;
    if (declaresUnit(text, v.unit)) return true;
  }
  return false;
}

/** Deal stage words, strongest first. */
const STAGES: [string, RegExp][] = [
  ["cancelled", /\b(?:cancel+ed|terminated|withdrawn|called off)\b/i],
  [
    "completed",
    /\b(?:completed?|completion|consummated|closed the (?:acquisition|deal|transaction))\b/i,
  ],
  ["approved", /\b(?:approved?|approval|sanctioned)\b/i],
  ["announced", /\b(?:announced?|entered into|signed|executed)\b/i],
  ["proposed", /\b(?:proposed?|proposal|exploring|considering|in talks|evaluat(?:e|ing))\b/i],
];

/** Does the official text support the claim's deal stage? "not_applicable" always passes. */
export function stageSupported(stage: string, text: string): FigureCheck {
  if (stage === "not_applicable") return { found: true, note: "" };
  const pattern = STAGES.find(([s]) => s === stage)?.[1];
  if (!pattern) return { found: true, note: "" };
  return pattern.test(text)
    ? { found: true, note: "" }
    : { found: false, note: `the deal stage "${stage}" is not stated in the official text` };
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
