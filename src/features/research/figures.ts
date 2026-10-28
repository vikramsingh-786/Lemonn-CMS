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

function unitOf(s: string): string | null {
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

/** Number written with the fewest decimals needed (6.0 → "6", 13.77 → "13.77"). */
function plain(n: number): string {
  return Number(n.toFixed(4)).toString();
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
 */
export function checkFigure(figure: string, text: string): FigureCheck {
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
      if (!has(text, `${num}\\s*(?:%|per\\s?cent(?!age))`))
        return { found: false, note: `"${raw}%" not found` };
      continue;
    }
    if (unit && last) {
      if (amountFound(raw, unit, text)) continue;
      return {
        found: false,
        note: `"${figure}" not found in the same unit or an exact conversion`,
      };
    }
    if (!has(text, num)) return { found: false, note: `"${raw}" not found` };
  }
  return { found: true, note: "" };
}

function amountFound(raw: string, unit: string, text: string): boolean {
  const value = Number(raw.replace(/,/g, ""));
  const inCrore = value * UNIT_IN_CRORE[unit]!;
  for (const [other, factor] of Object.entries(UNIT_IN_CRORE)) {
    const converted = plain(inCrore / factor);
    // Same number written next to its unit ("1,377 crore", "Rs 13,770 mn").
    if (has(text, `${numberPattern(converted)}\\s*(?:${UNIT_WORDS[other]})(?![\\p{L}])`))
      return true;
  }
  // Bare number in a table whose header states the unit ("(Rs. in Crores)").
  return (
    has(text, numberPattern(raw)) && has(text, `(?:in|₹|rs\\.?|inr)\\s*(?:${UNIT_WORDS[unit]})`)
  );
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
export function dateHint(url: string, publishedAt: string | null): Date | null {
  if (publishedAt) {
    const d = new Date(publishedAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const m = url.toLowerCase().match(new RegExp(`/(${MONTH_RE})-(20\\d{2})/`));
  if (m) {
    const month = MONTHS.findIndex((x) => m[1]!.startsWith(x.slice(0, 3)));
    return new Date(Date.UTC(Number(m[2]), month, 1));
  }
  return null;
}
