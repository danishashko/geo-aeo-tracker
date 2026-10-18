/**
 * Pure brand matching, sentiment and visibility scoring helpers.
 * Terms match as whole words (Unicode-aware), and overlapping terms
 * ("Acme", "Acme Inc") count the longest match once.
 */

export type Sentiment = "positive" | "neutral" | "negative" | "not-mentioned";

const POSITIVE_WORDS = [
  "best",
  "leading",
  "top",
  "excellent",
  "recommend",
  "great",
  "outstanding",
  "innovative",
  "trusted",
  "powerful",
  "superior",
  "preferred",
  "popular",
  "reliable",
  "impressive",
  "standout",
  "strong",
  "ideal",
];

const NEGATIVE_WORDS = [
  "worst",
  "poor",
  "bad",
  "avoid",
  "lacking",
  "weak",
  "inferior",
  "disappointing",
  "overpriced",
  "limited",
  "outdated",
  "risky",
  "problematic",
  "concern",
  "drawback",
  "downside",
];

const BEFORE = "(?<![\\p{L}\\p{N}_])";
const AFTER = "(?![\\p{L}\\p{N}_])";

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word, case-insensitive, Unicode-aware regex. Spaces match any run of whitespace. */
function wordRegex(term: string, suffix = ""): RegExp {
  const body = term.trim().split(/\s+/).map(escapeRegExp).join("\\s+");
  return new RegExp(`${BEFORE}${body}${suffix}${AFTER}`, "giu");
}

interface Span {
  start: number;
  end: number;
}

/** All non-overlapping matches across terms; where terms overlap the longest wins. */
function matchSpans(text: string, terms: string[]): Span[] {
  const all: Span[] = [];
  for (const term of terms) {
    if (!term.trim()) continue;
    for (const m of text.matchAll(wordRegex(term))) {
      all.push({ start: m.index, end: m.index + m[0].length });
    }
  }
  all.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Span[] = [];
  let lastEnd = -1;
  for (const s of all) {
    if (s.start >= lastEnd) {
      kept.push(s);
      lastEnd = s.end;
    }
  }
  return kept;
}

/** Terms that appear in text as whole words. */
export function findMentions(text: string, terms: string[]): string[] {
  return terms.filter((t) => t.trim() && wordRegex(t).test(text));
}

/** Number of distinct mentions, each overlapping group counted once. */
export function countMentions(text: string, terms: string[]): number {
  return matchSpans(text, terms).length;
}

export function detectSentiment(
  answer: string,
  brandTerms: string[],
): Sentiment {
  if (brandTerms.length === 0) return "not-mentioned";
  if (findMentions(answer, brandTerms).length === 0) return "not-mentioned";

  const suffix = "(?:s|d|ed|ing|ly)?";
  const count = (words: string[]) =>
    words.filter((w) => wordRegex(w, suffix).test(answer)).length;
  const posScore = count(POSITIVE_WORDS);
  const negScore = count(NEGATIVE_WORDS);

  if (posScore > negScore + 1) return "positive";
  if (negScore > posScore + 1) return "negative";
  return "neutral";
}

/** 0-100 visibility score. */
export function calcVisibilityScore(
  answer: string,
  sources: string[],
  brandTerms: string[],
  websites: string[],
): number {
  if (brandTerms.length === 0) return 0;
  const spans = matchSpans(answer, brandTerms);
  if (spans.length === 0) return 0;
  let score = 30;

  // Mentioned in first 200 chars (prominent position)? +20
  if (spans.some((s) => s.start < 200)) score += 20;

  // Multiple mentions? +15
  if (spans.length >= 3) score += 15;
  else if (spans.length >= 2) score += 8;

  // Brand website in sources? +20
  const websiteDomains = websites
    .map((w) =>
      w
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "")
        .toLowerCase(),
    )
    .filter(Boolean);
  if (
    websiteDomains.length > 0 &&
    sources.some((s) => {
      const sl = s.toLowerCase();
      return websiteDomains.some((d) => sl.includes(d));
    })
  ) {
    score += 20;
  }

  // Sentiment bonus
  const sent = detectSentiment(answer, brandTerms);
  if (sent === "positive") score += 15;
  else if (sent === "neutral") score += 5;

  return Math.min(100, score);
}
