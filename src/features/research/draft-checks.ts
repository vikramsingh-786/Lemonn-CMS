import { checkFigure } from "./figures";
import type { DraftCheck } from "./types";

import { DRAFT_LIMITS } from "./draft-limits";

export { DRAFT_LIMITS };

/** A shared run of this many consecutive words counts as copying. */
const COPY_WORDS = 12;

/** Investment-advice language (an editor must remove it before publishing). */
// "buy-back" and "sell-off" are news words, not advice.
const ADVICE =
  /\b(?:buy(?![- ]?backs?\b)|sell(?![- ]?offs?\b)|target price|price target|should invest|must invest|multibaggers?|guaranteed returns?|accumulate|book profits?|stop[- ]loss|top picks?|add to (?:your )?portfolio)\b/i;

/** Numbers as written, with a following %/unit so unit conversions are checked too. */
// Not digits inside a word or name ("5G", "Q3", "FY27", "Web3", "Covid-19", "Nifty50"), and a
// trailing comma is punctuation ("December 3, 2026" → "3" and "2026").
const NUMBER =
  /(?<![\p{L}\d.,]|\p{L}-)\d(?:[\d,]*\d)?(?:\.\d+)?(?:\s*(?:%|per\s?cent(?!age)|(?:lakhs?|lacs?)\s*(?:crores?|cr\b)|thousand\s*crores?|crores?|cr\b|lakhs?|million|billion|trillion|bn\b|mn\b|tn\b))?(?![\p{L}\d])/giu;

export type DraftText = {
  headline: string;
  summary: string;
  body: string;
  seoTitle: string;
  seoDescription: string;
  tags: string[];
  claimIdsUsed: string[];
};

export type CheckContext = {
  /** Verified claim texts + figures + their evidence passages: the only allowed source of facts. */
  allowedText: string;
  /** Claim ids given to the model (K1…Kn). */
  givenIds: readonly string[];
  /** Evidence passages and the original report title(s): text the draft must not copy. */
  copySources: readonly string[];
};

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * What a claim lets an article say: its text and figures, minus the figures the official source did
 * not confirm (`unconfirmedFigures`), so a miscomputed percentage can't pass the figures check.
 */
export function claimFacts(a: {
  claim: string;
  figures: readonly string[];
  unconfirmedFigures?: readonly string[];
}): string {
  const bad = a.unconfirmedFigures ?? [];
  let text = a.claim;
  for (const f of bad) {
    const n = f.match(/\d[\d,]*(?:\.\d+)?/)?.[0];
    if (n)
      text = text.replace(
        new RegExp(`(?<![\\d.,])${n.replace(/\./g, "\\.")}(?![\\d])`, "g"),
        "[unconfirmed]",
      );
  }
  return [text, ...a.figures.filter((f) => !bad.includes(f))].join("\n");
}

/** Words that attribute or connect rather than state a fact; ignored by the traceability check. */
const FILLER = new Set(
  (
    "according reported reportedly reports report media said says stated statement filing exchange company " +
    "official officially source sources also added further while during quarter period year compared " +
    "against which with that this these those their there have from into about after before over under " +
    "will would could should been being were than then when where what"
  ).split(" "),
);
/** Share of a sentence's content words that must appear in the claims or evidence. */
const TRACE_MIN = 0.5;
const contentWords = (s: string) =>
  words(s)
    .filter((w) => w.length >= 4 && !/^\d/.test(w) && !FILLER.has(w))
    .map((w) => w.replace(/(?:ies|es|s)$/, ""));

/** Sentences of `text` whose content words mostly don't appear in `allowed` (possible invented facts). */
export function untraceableSentences(text: string, allowed: string): string[] {
  const known = new Set(contentWords(allowed));
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"'“‘])|\n+/)
    .map((s) => s.trim())
    .filter((s) => {
      const w = contentWords(s);
      return w.length >= 4 && w.filter((x) => known.has(x)).length / w.length < TRACE_MIN;
    });
}

function shingles(s: string): Set<string> {
  const w = words(s);
  const out = new Set<string>();
  for (let i = 0; i + COPY_WORDS <= w.length; i++) out.add(w.slice(i, i + COPY_WORDS).join(" "));
  return out;
}

function sentences(s: string): number {
  // Split on sentence ends, not on decimals ("2.5") or abbreviations like "Rs." followed by a digit.
  return s.split(/(?<=[.!?])\s+(?=[A-Z"'“‘])/).filter((x) => x.trim().length > 0).length;
}

/** Runs every deterministic check on a draft. Application code decides readiness from these. */
export function runDraftChecks(draft: DraftText, ctx: CheckContext): DraftCheck[] {
  const fields = [draft.headline, draft.summary, draft.body, draft.seoTitle, draft.seoDescription];
  const all = fields.join("\n");

  // 1. Figures: every number/date must come from a verified claim or its evidence.
  const invented = [
    ...new Set(
      [...all.matchAll(NUMBER)]
        .map((m) => m[0].trim())
        .filter((n) => !checkFigure(n, ctx.allowedText).found),
    ),
  ];

  // 2. Claim ids: non-empty and only ids that were given.
  const unknown = draft.claimIdsUsed.filter((id) => !ctx.givenIds.includes(id));

  // 3. Copying: no 12-word run shared with any evidence passage or the original title.
  const source = new Set(ctx.copySources.flatMap((s) => [...shingles(s)]));
  const copied = fields.flatMap((f) => [...shingles(f)]).find((g) => source.has(g));

  // 4. Advice language.
  const advice = all.match(ADVICE)?.[0];

  // 5. Traceability: sentences that state things the claims and evidence don't contain.
  const untraceable = untraceableSentences([draft.summary, draft.body].join("\n"), ctx.allowedText);

  // 6. Lengths.
  const L = DRAFT_LIMITS;
  const bodyWords = words(draft.body).length;
  const length = [
    draft.headline.length > L.headline && `headline ${draft.headline.length}/${L.headline} chars`,
    draft.seoTitle.length > L.seoTitle && `SEO title ${draft.seoTitle.length}/${L.seoTitle} chars`,
    draft.seoDescription.length > L.seoDescription &&
      `SEO description ${draft.seoDescription.length}/${L.seoDescription} chars`,
    (bodyWords < L.bodyWordsMin || bodyWords > L.bodyWordsMax) &&
      `body ${bodyWords} words (${L.bodyWordsMin}–${L.bodyWordsMax})`,
    sentences(draft.summary) > L.summarySentencesMax &&
      `summary has ${sentences(draft.summary)} sentences (max ${L.summarySentencesMax})`,
    (draft.tags.length < L.tagsMin || draft.tags.length > L.tagsMax) &&
      `${draft.tags.length} tags (${L.tagsMin}–${L.tagsMax})`,
  ].filter((x): x is string => typeof x === "string");

  return [
    {
      check: "figures",
      passed: invented.length === 0,
      note: invented.length ? `Not in verified claims or evidence: ${invented.join(", ")}` : "",
    },
    {
      check: "claim_ids",
      passed: draft.claimIdsUsed.length > 0 && unknown.length === 0,
      note:
        draft.claimIdsUsed.length === 0
          ? "No claim ids listed"
          : unknown.length
            ? `Unknown claim ids: ${unknown.join(", ")}`
            : "",
    },
    {
      check: "no_copying",
      passed: !copied,
      note: copied ? `Copied ${COPY_WORDS}+ words: "${copied}"` : "",
    },
    { check: "no_advice", passed: !advice, note: advice ? `Advice language: "${advice}"` : "" },
    {
      check: "traceable",
      passed: untraceable.length === 0,
      note: untraceable.length
        ? `Not found in the claims or evidence: ${untraceable.map((x) => `"${x.slice(0, 120)}"`).join(" ")}`
        : "",
    },
    { check: "lengths", passed: length.length === 0, note: length.join("; ") },
  ];
}
