import {
  countWords,
  isListShaped,
  normalizeForHash,
  queryTerms,
  splitSentences,
} from "./rank-signal-passages";

/**
 * Rank Signal starter catalog. IDs are frozen after release: any change to a
 * row (detector, transform, checks, wording) bumps CATALOG_VERSION so the
 * pooled "All runs" view never mixes two definitions of one signal.
 * v2: S00 is a one-sentence paraphrase instead of an inserted filler clause.
 */
export const CATALOG_VERSION = 2;

export interface SignalContext {
  keyword: string;
  now: Date;
}

export interface SignalChecks {
  /** Detector must pass on `with` and fail on `without`. */
  detector: boolean;
  /** Allowed word-count ratio with/without. */
  lengthRatio: [number, number];
  /** Minimum word-level similarity (1 − Levenshtein / max length); null = off. */
  similarity: number | null;
  /** Exactly one sentence differs and the sentence count is unchanged. */
  singleSentenceEdit?: boolean;
}

export type DetectorKind = "none" | "llm" | "pair" | "code";

export interface SignalDef {
  id: string;
  name: string;
  build: "code" | "llm";
  addOnly: boolean;
  detectorKind: DetectorKind;
  /** Present when detectorKind === "code". */
  detect?: (text: string, ctx: SignalContext) => boolean;
  /** One-line feature description handed to the rewriter. */
  feature: string;
  /** Code-built signals only: returns `with` from the base, or null to skip. */
  transform?: (text: string, ctx: SignalContext) => string | null;
  /** Code-built signals only: base passages that can't take the edit. */
  skip?: (text: string, ctx: SignalContext) => boolean;
  checks: SignalChecks;
  expected: "+" | "-" | "?";
  note?: string;
}

const DEFAULT_CHECKS: SignalChecks = {
  detector: true,
  lengthRatio: [0.85, 1.18],
  similarity: 0.8,
};

// ─── Helpers ─────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Words for similarity/length checks: markdown punctuation is ignored. */
export function wordTokens(text: string): string[] {
  return (
    text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu) ?? []
  ).map((w) => w.replace(/’/g, "'"));
}

/** 1 − word-level Levenshtein distance / max length. */
export function wordSimilarity(a: string, b: string): number {
  const x = wordTokens(a);
  const y = wordTokens(b);
  const max = Math.max(x.length, y.length);
  if (max === 0) return 1;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return 1 - prev[y.length] / max;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_YEAR =
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(?:\d{1,2}(?:st|nd|rd|th)?,?\s+)?(?:19|20)\d{2}\b/i;

// First words that are safe to lowercase after "As of {Month YYYY}, ".
const LOWERCASE_OK = new Set(
  "the a an this that these those it its there most many some all each every our we you your if when while in on for with to by at as after before since although because".split(
    " ",
  ),
);

function firstLine(text: string): string {
  return text.trimStart().split("\n")[0] ?? "";
}

function questionFromKeyword(keyword: string): string {
  const k = keyword.trim().replace(/[?.!]+$/, "");
  const cap = k.charAt(0).toUpperCase() + k.slice(1);
  if (
    /^(what|how|why|which|who|when|where|is|are|can|does|do|should|will)\b/i.test(
      k,
    )
  )
    return `${cap}?`;
  if (/^(best|top|cheapest|most|fastest|easiest|leading)\b/i.test(k))
    return `What is the ${k}?`;
  return `What is ${k}?`;
}

function termRegex(term: string, flags = "giu"): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])(${escapeRegex(term)})(?![\\p{L}\\p{N}])`,
    flags,
  );
}

// ─── Detectors ───────────────────────────────────────────────────────────

const NUMBER_WITH_UNIT =
  /[$€£¥]\s?\d|\b\d[\d,.]*\s?(?:%|percent\b|per ?cent\b|x\b|times\b|million\b|billion\b|thousand\b|k\b|bn\b|kg\b|g\b|lbs?\b|oz\b|km\b|miles?\b|minutes?\b|mins?\b|hours?\b|hrs?\b|days?\b|weeks?\b|months?\b|years?\b|seconds?\b|ms\b|[kmgt]b\b|usd\b|eur\b|servings?\b|calories\b|people\b|users\b|customers\b)/i;

const ATTRIBUTION =
  /(?:[Aa]ccording to|[Aa]s reported by|[Rr]eported by|[Dd]ata from|[Rr]esearch (?:by|from)|(?:[Ss]tudy|[Ss]urvey|[Rr]eport|[Aa]nalysis) (?:by|from)|[Pp]ublished by)\s+(?:the |a |an )?[A-Z0-9]/;

const HEDGES =
  /\b(?:may(?!\s+\d)|might|possibly|perhaps|probably|likely|arguably|potentially|seemingly|appears to|seems to|could be|tends to)\b/gi;

const SUPERLATIVES = [
  "best-in-class",
  "world-class",
  "unbeatable",
  "unparalleled",
  "unmatched",
  "revolutionary",
  "game-changing",
  "cutting-edge",
  "industry-leading",
  "ultimate",
  "incredible",
  "amazing",
  "outstanding",
  "exceptional",
  "the best",
  "number one",
  "top-rated",
  "must-have",
  "premier",
  "second to none",
];

export function hasNumber(text: string): boolean {
  return NUMBER_WITH_UNIT.test(text);
}

export function hasAttribution(text: string): boolean {
  return ATTRIBUTION.test(text);
}

export function hasFirstPerson(text: string): boolean {
  return /\b(?:we|our)\b/i.test(text) || /\bI\b/.test(text);
}

export function hedgeCount(text: string): number {
  return text.match(HEDGES)?.length ?? 0;
}

/** Superlatives that aren't part of the query itself. */
export function hasSuperlative(text: string, keyword: string): boolean {
  const terms = new Set(queryTerms(keyword));
  return SUPERLATIVES.filter(
    (s) => !(s.match(/[\p{L}\p{N}]+/gu) ?? []).some((w) => terms.has(w)),
  ).some((s) => termRegex(s, "iu").test(text));
}

export function hasDefinition(text: string, keyword: string): boolean {
  const kw = keyword.trim().split(/\s+/).map(escapeRegex).join("\\s+");
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${kw}s?\\s+(?:is|are|refers to|means)\\s+(?:a|an|the)\\b`,
    "iu",
  ).test(text);
}

function normalizePhrase(s: string): string {
  return ` ${s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()} `;
}

export function hasExactQuery(text: string, keyword: string): boolean {
  return normalizePhrase(text).includes(normalizePhrase(keyword));
}

export function hasBulletList(text: string): boolean {
  return text.split("\n").filter((l) => /^\s*-\s+\S/.test(l)).length >= 2;
}

export function hasFreshnessClause(text: string): boolean {
  return /^\s*As of [A-Z][a-z]+ \d{4},/.test(text);
}

export function hasQuestionHeading(text: string): boolean {
  return /^#{1,6}\s+.+\?\s*$/.test(firstLine(text).trim());
}

export function hasBoldQueryTerm(text: string, keyword: string): boolean {
  const terms = queryTerms(keyword);
  for (const m of text.matchAll(/\*\*([^*]+)\*\*/g)) {
    if (terms.some((t) => termRegex(t, "iu").test(m[1]))) return true;
  }
  return false;
}

// ─── Code transforms (add only; change only the feature span) ───────────

export function toBulletList(text: string): string | null {
  const sentences = splitSentences(text);
  if (sentences.length < 2) return null;
  return sentences.map((s) => `- ${s}`).join("\n");
}

export function addFreshnessClause(text: string, now: Date): string | null {
  const body = text.trimStart();
  if (/^(?:[-*+]|\d+[.)])\s/.test(body)) return null;
  const firstWord = body.match(/^[\p{L}']+/u)?.[0] ?? "";
  const lead = LOWERCASE_OK.has(firstWord.toLowerCase())
    ? body.charAt(0).toLowerCase() + body.slice(1)
    : body;
  return `As of ${MONTHS[now.getMonth()]} ${now.getFullYear()}, ${lead}`;
}

export function addQuestionHeading(text: string, keyword: string): string {
  return `## ${questionFromKeyword(keyword)}\n\n${text.trimStart()}`;
}

export function boldQueryTerms(text: string, keyword: string): string | null {
  let out = text;
  for (const term of queryTerms(keyword)) {
    out = out.replace(termRegex(term), "**$1**");
  }
  if (out === text) return null;
  // Merge adjacent bolded terms: "**meal** **kit**" → "**meal kit**"
  return out.replace(/\*\*([ \t]+)\*\*/g, "$1");
}

// ─── Catalog ─────────────────────────────────────────────────────────────

export const FEATURE_CATALOG: SignalDef[] = [
  {
    id: "S00",
    name: "Placebo: one sentence paraphrased",
    build: "llm",
    addOnly: true,
    detectorKind: "none",
    feature:
      "one existing sentence reworded: the same facts and meaning, a similar length, and no new information, claim, number, source, formatting or emphasis",
    checks: {
      detector: false,
      lengthRatio: [0.9, 1.1],
      similarity: 0.8,
      singleSentenceEdit: true,
    },
    expected: "?",
    note: "Calibration: a meaning-preserving, size-neutral edit, so it measures the judge's reaction to being edited at all.",
  },
  {
    id: "S01",
    name: "Leads with a direct answer",
    build: "llm",
    addOnly: false,
    detectorKind: "llm",
    feature:
      "the passage opens with a sentence that directly answers the query",
    checks: { ...DEFAULT_CHECKS, detector: false },
    expected: "+",
  },
  {
    id: "S02",
    name: "Contains a specific number or statistic",
    build: "llm",
    addOnly: false,
    detectorKind: "code",
    detect: (t) => hasNumber(t),
    feature:
      'at least one specific number with a unit or percentage (for example "42%", "15 minutes", "$9.99")',
    checks: DEFAULT_CHECKS,
    expected: "+",
  },
  {
    id: "S03",
    name: "Names the entity explicitly",
    build: "llm",
    addOnly: false,
    detectorKind: "llm",
    feature:
      "the subject entity is named explicitly instead of being referred to with a pronoun (it, they, this)",
    checks: { ...DEFAULT_CHECKS, detector: false },
    expected: "+",
  },
  {
    id: "S04",
    name: "Cites a named source",
    build: "llm",
    addOnly: false,
    detectorKind: "code",
    detect: (t) => hasAttribution(t),
    feature:
      'a claim attributed to a named source with "according to …" or a similar attribution phrase',
    checks: DEFAULT_CHECKS,
    expected: "+",
  },
  {
    id: "S05",
    name: "List format",
    build: "code",
    addOnly: true,
    detectorKind: "code",
    detect: (t) => hasBulletList(t),
    feature: 'the sentences formatted as "- " bullet points',
    transform: (t) => toBulletList(t),
    skip: (t) => isListShaped(t),
    checks: { ...DEFAULT_CHECKS, similarity: null },
    expected: "+",
  },
  {
    id: "S06",
    name: 'Freshness clause ("As of Month YYYY")',
    build: "code",
    addOnly: true,
    detectorKind: "code",
    detect: (t) => hasFreshnessClause(t),
    feature: 'a leading "As of {Month YYYY}," freshness clause',
    transform: (t, ctx) => addFreshnessClause(t, ctx.now),
    skip: (t) => MONTH_YEAR.test(t),
    checks: DEFAULT_CHECKS,
    expected: "+",
  },
  {
    id: "S07",
    name: "First-person experience",
    build: "llm",
    addOnly: false,
    detectorKind: "code",
    detect: (t) => hasFirstPerson(t),
    feature:
      'a first-person experience statement such as "We tested …" or "In our experience …"',
    checks: DEFAULT_CHECKS,
    expected: "?",
  },
  {
    id: "S08",
    name: "Hedging language",
    build: "llm",
    addOnly: false,
    detectorKind: "code",
    detect: (t) => hedgeCount(t) >= 2,
    feature:
      "hedging language (may, might, possibly, perhaps) used at least twice",
    checks: DEFAULT_CHECKS,
    expected: "-",
  },
  {
    id: "S09",
    name: "Promotional superlatives",
    build: "llm",
    addOnly: false,
    detectorKind: "code",
    detect: (t, ctx) => hasSuperlative(t, ctx.keyword),
    feature:
      'promotional superlatives such as "best-in-class", "unbeatable" or "world-class"',
    checks: DEFAULT_CHECKS,
    expected: "-",
  },
  {
    id: "S10",
    name: "Definition sentence",
    build: "llm",
    addOnly: false,
    detectorKind: "code",
    detect: (t, ctx) => hasDefinition(t, ctx.keyword),
    feature: 'a definition sentence of the form "{keyword} is a …"',
    checks: DEFAULT_CHECKS,
    expected: "+",
  },
  {
    id: "S11",
    name: "Exact query phrase present",
    build: "llm",
    addOnly: false,
    detectorKind: "code",
    detect: (t, ctx) => hasExactQuery(t, ctx.keyword),
    feature: 'the exact query phrase "{keyword}"',
    checks: DEFAULT_CHECKS,
    expected: "?",
    note: "Mostly runs in the remove direction: passages are ranked by query overlap.",
  },
  {
    id: "S12",
    name: "Question heading from the query",
    build: "code",
    addOnly: true,
    detectorKind: "code",
    detect: (t) => hasQuestionHeading(t),
    feature: 'a leading "## {Question}?" heading built from the query',
    transform: (t, ctx) => addQuestionHeading(t, ctx.keyword),
    skip: (t) => /^#{1,6}\s/.test(firstLine(t).trim()),
    checks: DEFAULT_CHECKS,
    expected: "?",
  },
  {
    id: "S13",
    name: "Bold query terms",
    build: "code",
    addOnly: true,
    detectorKind: "code",
    detect: (t, ctx) => hasBoldQueryTerm(t, ctx.keyword),
    feature: "the query terms in **bold**",
    transform: (t, ctx) => boldQueryTerms(t, ctx.keyword),
    skip: (t) => /\*\*[^*]+\*\*|__[^_]+__/.test(t),
    checks: DEFAULT_CHECKS,
    expected: "?",
  },
  {
    id: "S14",
    name: "Concise (about 40% shorter)",
    build: "llm",
    addOnly: true,
    detectorKind: "pair",
    feature:
      "the same passage about 40% shorter, keeping every fact and dropping only filler",
    checks: { detector: false, lengthRatio: [0.5, 0.75], similarity: null },
    expected: "?",
  },
];

/** Run order: S00, then code-built, then LLM-built (so a capped run still covers the cheap ones). */
export const RUN_ORDER: string[] = [
  "S00",
  ...FEATURE_CATALOG.filter((s) => s.build === "code").map((s) => s.id),
  ...FEATURE_CATALOG.filter((s) => s.build === "llm" && s.id !== "S00").map(
    (s) => s.id,
  ),
];

export function getSignal(id: string): SignalDef | undefined {
  return FEATURE_CATALOG.find((s) => s.id === id);
}

export function fillKeyword(text: string, keyword: string): string {
  return text.replace(/\{keyword\}/g, keyword);
}

/**
 * Whether a base passage can serve this signal without a rewriter call.
 * Code-built signals skip bases that already have the feature or can't take
 * the edit; LLM-built signals always go to the rewriter.
 */
export function isEligible(
  signal: SignalDef,
  text: string,
  ctx: SignalContext,
): boolean {
  if (signal.build !== "code") return true;
  if (signal.skip?.(text, ctx)) return false;
  if (signal.detect?.(text, ctx)) return false;
  return signal.transform?.(text, ctx) != null;
}

const ECHO =
  /(smallest edit|word-for-word|"with"|"without"|\bpassage [ab]\b|^\s*(?:here is|here's|sure[,!]))/i;

export type CheckResult = { ok: true } | { ok: false; reason: string };

/** Per-signal control checks, run in code before the judge sees the pair. */
export function checkPair(
  signal: SignalDef,
  pair: { with: string; without: string },
  ctx: SignalContext,
): CheckResult {
  const w = pair.with?.trim() ?? "";
  const wo = pair.without?.trim() ?? "";
  if (!w || !wo) return { ok: false, reason: "empty side" };
  if (ECHO.test(w) || ECHO.test(wo))
    return { ok: false, reason: "echoes instructions" };
  // No-op pairs: identical after case/whitespace normalisation, or (for
  // rewriter-built pairs) the same words with only markup changed.
  if (normalizeForHash(w) === normalizeForHash(wo))
    return { ok: false, reason: "identical sides" };
  if (
    signal.build === "llm" &&
    wordTokens(w).join(" ") === wordTokens(wo).join(" ")
  )
    return { ok: false, reason: "identical words" };

  if (signal.checks.singleSentenceEdit) {
    const a = splitSentences(w);
    const b = splitSentences(wo);
    const changed = a.filter(
      (s, i) => wordTokens(s).join(" ") !== wordTokens(b[i] ?? "").join(" "),
    ).length;
    if (a.length !== b.length || changed !== 1)
      return { ok: false, reason: `${changed} sentences changed` };
  }

  if (signal.checks.detector && signal.detect) {
    if (!signal.detect(w, ctx))
      return { ok: false, reason: "feature missing from with" };
    if (signal.detect(wo, ctx))
      return { ok: false, reason: "feature present in without" };
  }

  const ratio = countWords(w) / Math.max(1, countWords(wo));
  const [lo, hi] = signal.checks.lengthRatio;
  if (ratio < lo || ratio > hi)
    return { ok: false, reason: `length ratio ${ratio.toFixed(2)}` };

  if (signal.checks.similarity != null) {
    const sim = wordSimilarity(w, wo);
    if (sim < signal.checks.similarity)
      return { ok: false, reason: `similarity ${sim.toFixed(2)}` };
  }
  return { ok: true };
}
