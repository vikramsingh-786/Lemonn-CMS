/** Field limits the prompt asks for; checked by draft-checks, never auto-fixed; shown live in the article editor. */
export const DRAFT_LIMITS = {
  headline: 110,
  seoTitle: 60,
  seoDescription: 155,
  bodyWordsMin: 150,
  bodyWordsMax: 300,
  summarySentencesMax: 2,
  tagsMin: 2,
  tagsMax: 5,
} as const;
