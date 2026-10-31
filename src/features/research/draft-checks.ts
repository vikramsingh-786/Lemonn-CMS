import { checkFigure } from "./figures";
import type { DraftCheck } from "./types";

import { DRAFT_LIMITS } from "./draft-limits";

export { DRAFT_LIMITS };

/** A shared run of this many consecutive words counts as copying. */
const COPY_WORDS = 12;

/** Investment-advice language (an editor must remove it before publishing). */
const ADVICE =
  /\b(?:buy|sell|target price|price target|should invest|must invest|multibaggers?|guaranteed returns?|accumulate|book profits?|stop[- ]loss)\b/i;

/** Numbers as written, with a following %/unit so unit conversions are checked too. */
const NUMBER =
  /\d[\d,]*(?:\.\d+)?(?:\s*(?:%|per\s?cent(?!age)|crores?|cr\b|lakhs?|million|billion|bn\b|mn\b))?/gi;

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

  // 5. Lengths.
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
    { check: "lengths", passed: length.length === 0, note: length.join("; ") },
  ];
}
