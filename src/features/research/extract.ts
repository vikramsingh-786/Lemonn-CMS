import "server-only";
import { extractText } from "unpdf";
import type { FetchedDoc } from "@/lib/safe-fetch";
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

type Term = { regex: RegExp; weight: number; label: string };

/** Distinctive terms of a claim: numbers (≥3 digits weigh 3, others 1) and non-generic words. */
function claimTerms(claim: string, figures: readonly string[]): Term[] {
  const terms = new Map<string, Term>();
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
const HALF_WINDOW = 450;

/**
 * At most `maxChars` of `text` for the model: the cover (who filed what) plus the windows where
 * the claim's distinctive terms occur together, best-scoring first.
 */
export function relevantExcerpt(
  text: string,
  claims: readonly { text: string; figures: readonly string[] }[],
  maxChars = 4000,
): string {
  if (text.length <= maxChars) return text;
  const terms = claims.flatMap((c) => claimTerms(c.text, c.figures));
  const hits: { pos: number; term: Term }[] = [];
  for (const term of terms) {
    for (const m of text.matchAll(term.regex)) {
      hits.push({ pos: m.index, term });
      if (hits.length > 3000) break;
    }
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

  const chosen: { start: number; end: number }[] = [];
  let budget = maxChars - COVER;
  for (const w of windows) {
    if (budget <= 0) break;
    if (chosen.some((c) => w.start < c.end && w.end > c.start)) continue;
    const end = Math.min(w.end, w.start + budget);
    chosen.push({ start: w.start, end });
    budget -= end - w.start;
  }
  chosen.sort((a, b) => a.start - b.start);
  return [text.slice(0, COVER), ...chosen.map((c) => text.slice(c.start, c.end))].join(" … ");
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
