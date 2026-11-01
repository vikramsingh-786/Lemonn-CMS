import "server-only";
import { extractText } from "unpdf";
import type { FetchedDoc } from "@/lib/safe-fetch";
import { amountConversions, numbersNear, unitOf } from "./figures";
import { decodeEntities } from "./sitemaps";

const DROP_BLOCKS = /<(script|style|noscript|nav|header|footer|aside|svg|form)\b[\s\S]*?<\/\1>/gi;

/** Site chrome that sometimes sits in <p> tags (e.g. Moneycontrol's browser banner). */
const BOILERPLATE =
  /outdated browser|enable javascript|subscribe to (?:our|the) newsletter|download the app/i;

const clean = (s: string) =>
  decodeEntities(s.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

/** All `articleBody` strings inside the page's JSON-LD blocks. */
function jsonLdArticleBody(html: string): string {
  const bodies: string[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        if (key === "articleBody" && typeof value === "string") bodies.push(value);
        else walk(value);
      }
    }
  };
  for (const [, json] of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      walk(JSON.parse(json!));
    } catch {
      // malformed JSON-LD is common; skip it
    }
  }
  return clean(bodies.join("\n"));
}

function metaDescription(html: string): string {
  const m =
    html.match(
      /<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]+content=["']([^"']*)["']/i,
    ) ??
    html.match(
      /<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:og:)?description["']/i,
    );
  return m ? clean(m[1]!) : "";
}

/**
 * Story text from a publisher page: JSON-LD articleBody, else real paragraphs (≥60 chars) with
 * page chrome removed, else the meta description. Paywalled pages may yield only a summary.
 */
export function articleText(html: string): {
  text: string;
  from: "json-ld" | "paragraphs" | "meta" | "none";
} {
  const ld = jsonLdArticleBody(html);
  if (ld.length >= 200) return { text: ld, from: "json-ld" };
  const paragraphs = [...html.replace(DROP_BLOCKS, " ").matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(([, p]) => clean(p!))
    .filter((p) => p.length >= 60 && !BOILERPLATE.test(p));
  if (paragraphs.length > 0) return { text: paragraphs.join("\n"), from: "paragraphs" };
  const meta = metaDescription(html);
  return meta ? { text: meta, from: "meta" } : { text: "", from: "none" };
}

/** Visible text of an official HTML page or PDF (full text stays server-side). */
export async function documentText(doc: FetchedDoc): Promise<string> {
  if (doc.kind === "pdf") {
    const { text } = await extractText(new Uint8Array(doc.bytes), { mergePages: true });
    return text.replace(/\s+/g, " ").trim();
  }
  const raw = new TextDecoder().decode(doc.bytes);
  if (doc.kind === "html") {
    const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
    return `${clean(title)}\n${clean(raw.replace(DROP_BLOCKS, " "))}`.trim();
  }
  return raw.replace(/\s+/g, " ").trim();
}

/** Words that appear in almost every filing, so they say nothing about which passage matters. */
const GENERIC = new Set(
  (
    "company companies limited ltd india indian quarter quarterly crore crores lakh lakhs profit " +
    "revenue rs inr the and for with from that this was were has have its year ended period board " +
    "results result net total income per share shares percent said says will over into after"
  ).split(" "),
);

/** Regex for a number that ignores comma placement: "1377" matches "1,377" and "13,77". */
function numberPattern(digits: string, decimals = ""): string {
  const body = [...digits].join(",?");
  return `(?<![\\d.,])${body}${decimals ? `\\.${decimals}` : ""}(?![\\d])`;
}

/** A distinctive term and where it occurs (`find` for amounts matched by value, not digits). */
type Term = { regex?: RegExp; find?: (text: string) => number[]; weight: number; label: string };

/**
 * Distinctive terms of a claim: numbers (≥3 digits weigh 3, others 1), each amount also in the
 * other units a filing may use ("₹63.33 crore" → "633" for a table in Rs. millions), and
 * non-generic words.
 */
function claimTerms(claim: string, figures: readonly string[]): Term[] {
  const terms = new Map<string, Term>();
  for (const figure of figures) {
    const unit = unitOf(figure);
    const amount = figure.match(/\d[\d,]*(?:\.\d+)?/)?.[0];
    if (!unit || !amount) continue;
    for (const v of amountConversions(amount, unit)) {
      const label = `${v.unit}:${v.value}`;
      if (v.value < 1 || v.value >= 1e9 || terms.has(label)) continue;
      // By value to the claim's rounding (₹294 crore = 2,940 million, printed 2,939.6). An amount
      // outweighs words: on 1 Nov 2026 a cover letter's words beat Quality Power's profit row.
      terms.set(label, {
        label,
        weight: 5,
        find: (text) => numbersNear(text, v.value, v.tolerance),
      });
    }
  }
  for (const m of `${claim} ${figures.join(" ")}`.matchAll(/\d[\d,]*(?:\.(\d+))?/g)) {
    const digits = m[0].split(".")[0]!.replace(/,/g, "");
    const decimals = m[1] ?? "";
    const label = decimals ? `${digits}.${decimals}` : digits;
    if (terms.has(label)) continue;
    terms.set(label, {
      label,
      weight: digits.length >= 3 ? 3 : 1,
      regex: new RegExp(numberPattern(digits, decimals), "g"),
    });
  }
  for (const w of claim.toLowerCase().match(/[\p{L}][\p{L}&'-]{2,}/gu) ?? []) {
    if (GENERIC.has(w) || terms.has(w)) continue;
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    terms.set(w, {
      label: w,
      weight: 1,
      regex: new RegExp(`(?<![\\p{L}])${escaped}(?![\\p{L}])`, "giu"),
    });
  }
  return [...terms.values()];
}

const COVER = 300;
/** "(Amt in Rs. millions)", "(₹ in crore)", "Rs. in Lakhs", "(in INR million)". */
const UNIT_STATEMENT =
  /\(?\s*(?:amt\.?|amount|figures|all amounts)?\s*(?:are\s+)?in\s+(?:rs\.?|₹|inr)?\s*(?:crores?|lakhs?|lacs?|millions?|mn|billions?|thousands?)\b\.?\s*\)?|\(\s*(?:rs\.?|₹|inr)\s*(?:in\s+)?(?:crores?|lakhs?|lacs?|millions?|mn|billions?|thousands?)\s*\)/gi;
const HALF_WINDOW = 450;

/**
 * At most `maxChars` of `text` for the model: the cover (who filed what) plus, for each claim, the
 * windows where its distinctive terms occur together. Claims take turns choosing their best window,
 * so one claim (or a cover letter) cannot crowd out the results table another claim needs.
 */
export function relevantExcerpt(
  text: string,
  claims: readonly { text: string; figures: readonly string[] }[],
  maxChars = 4000,
): string {
  if (text.length <= maxChars) return text;
  const ranked = claims.map((c) => rankedWindows(text, claimTerms(c.text, c.figures)));
  const chosen: { start: number; end: number }[] = [];
  let budget = maxChars - COVER;
  for (let round = 0; budget > 0 && ranked.some((r) => r.length > round); round++) {
    for (const windows of ranked) {
      const w = windows[round];
      if (!w || budget <= 0) continue;
      if (chosen.some((c) => w.start < c.end && w.end > c.start)) continue;
      const end = Math.min(w.end, w.start + budget);
      chosen.push({ start: w.start, end });
      budget -= end - w.start;
    }
  }
  chosen.sort((a, b) => a.start - b.start);
  // Tables state their unit once ("(Amt in Rs. millions)"); without it the model can't read
  // 633.27 as ₹63.33 crore (Quality Power, 1 Nov 2026), so every unit statement goes first.
  const units = [...new Set([...text.matchAll(UNIT_STATEMENT)].map((m) => m[0].trim()))];
  const head = [
    text.slice(0, COVER),
    ...(units.length > 0 ? [`[Units stated: ${units.slice(0, 3).join("; ")}]`] : []),
  ];
  return [...head, ...chosen.map((c) => text.slice(c.start, c.end))].join(" … ");
}

/** Windows around each hit of `terms`, best (most distinct term weight) first. */
function rankedWindows(text: string, terms: readonly Term[]) {
  const hits: { pos: number; term: Term }[] = [];
  for (const term of terms) {
    const positions = term.find
      ? term.find(text)
      : [...text.matchAll(term.regex!)].map((m) => m.index);
    for (const pos of positions.slice(0, 3000)) hits.push({ pos, term });
  }
  hits.sort((a, b) => a.pos - b.pos);

  // ponytail: O(hits²) window scoring; fine for a few thousand hits per document.
  const windows = hits.map(({ pos }) => {
    const start = Math.max(COVER, pos - HALF_WINDOW);
    const end = Math.min(text.length, pos + HALF_WINDOW);
    const seen = new Set<Term>();
    for (const h of hits) if (h.pos >= start && h.pos < end) seen.add(h.term);
    return { start, end, score: [...seen].reduce((n, t) => n + t.weight, 0) };
  });
  windows.sort((a, b) => b.score - a.score || a.start - b.start);
  return windows;
}

/** True when every number in `figure` appears in `text` (commas ignored); words: case-insensitive. */
export function figureInText(figure: string, text: string): boolean {
  const numbers = [...figure.matchAll(/\d[\d,]*(?:\.(\d+))?/g)];
  if (numbers.length === 0) return text.toLowerCase().includes(figure.toLowerCase().trim());
  return numbers.every((m) => {
    const digits = m[0].split(".")[0]!.replace(/,/g, "");
    return new RegExp(numberPattern(digits, m[1] ?? "")).test(text);
  });
}

/** Lowercased name tokens of an organisation without legal suffixes ("Tata Motors Ltd" → tata, motors). */
export function nameTokens(name: string): string[] {
  return (name.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (t) =>
      ![
        "limited",
        "ltd",
        "the",
        "pvt",
        "private",
        "inc",
        "corp",
        "corporation",
        "co",
        "plc",
        "of",
        "and",
        // Foreign legal forms ("Vega SAS" is one name word, as ambiguous as "Vega").
        "sas",
        "sa",
        "ag",
        "gmbh",
        "bv",
        "nv",
        "llc",
        "llp",
        "pjsc",
        "spa",
      ].includes(t),
  );
}

/** True when `text` names the organisation (every name token appears as a word). */
export function namesOrganisation(text: string, name: string): boolean {
  const lower = text.toLowerCase();
  const tokens = nameTokens(name);
  return (
    tokens.length > 0 &&
    tokens.every((t) => new RegExp(`(?<![\\p{L}\\p{N}])${t}(?![\\p{L}\\p{N}])`, "u").test(lower))
  );
}
