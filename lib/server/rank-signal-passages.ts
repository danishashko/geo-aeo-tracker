import { createHash } from "node:crypto";
import { fetchSerp } from "./serp";
import { scrapePages } from "./unlocker";
import type { ScrapedPage, SerpResult } from "./sro-types";

/**
 * Rank Signal passage pool. Turns Unlocker markdown into 60-180 word passages,
 * drops boilerplate, and ranks them by query-term overlap (BM25-lite) — a
 * cheap, deterministic stand-in for cross-encoder snippet reconstruction.
 *
 * Headings are kept on `heading`, separate from `text`. Only `text` is ever
 * shown to the judge, so a leading heading never leaks into a trial.
 */

export interface Passage {
  text: string;
  heading: string;
  origin: "target" | "competitor";
  domain: string;
  hash: string;
  score: number;
}

export const MIN_WORDS = 60;
export const MAX_WORDS = 180;
export const SPLIT_WORDS = 220;
export const TOP_PER_PAGE = 15;

const STOPWORDS = new Set(
  "a an and are as at be by for from how i in is it of on or that the this to vs what when where which who why with your you do does can".split(
    " ",
  ),
);

const STRONG_BOILERPLATE =
  /we use cookies|cookie (policy|settings|preferences|consent)|accept (all )?cookies|all rights reserved|©|skip to (main )?content/i;
const NAV_START =
  /^(home|menu|search|log ?in|sign ?in|sign up|subscribe|share|follow us|back to top|table of contents|related (posts|articles)|advertisement|privacy policy|terms)\b/i;
// Sections that only link elsewhere: everything under these headings is dropped.
const RELATED_HEADING =
  /\b(related (articles|posts|reading|content|stories|guides)|you (might|may) also like|more (from|articles|stories)|read (next|more)|recommended (for you|reading|articles)|popular (posts|articles))\b/i;
const LIST_LINE = /^\s*(?:[-*+]|\d+[.)])\s+\S/;
const BARE_URL_RE = /\bhttps?:\/\/\S+/g;

export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function splitSentences(text: string): string[] {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return [];
  return (flat.match(/[^.!?]+(?:[.!?]+["')\]]*(?=\s|$)|$)/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
}

export function isListShaped(text: string): boolean {
  return text.split("\n").filter((l) => LIST_LINE.test(l)).length >= 2;
}

export function normalizeForHash(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function hashPassage(text: string): string {
  return createHash("sha1").update(normalizeForHash(text)).digest("hex");
}

/** Share of a block's visible text that is link anchor text or a bare URL. */
function linkShare(block: string): number {
  let linked = 0;
  const visible = block
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, (_m, anchor: string) => {
      linked += anchor.replace(/\s+/g, "").length;
      return anchor;
    });
  for (const m of visible.matchAll(BARE_URL_RE)) linked += m[0].length;
  const total = visible.replace(/\s+/g, "").length;
  return total === 0 ? 0 : linked / total;
}

function isBoilerplateBlock(raw: string): boolean {
  const lines = raw.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return true;
  // Tables
  if (lines.filter((l) => l.trim().startsWith("|")).length * 2 >= lines.length)
    return true;
  if (linkShare(raw) > 0.3) return true;
  if (STRONG_BOILERPLATE.test(raw)) return true;
  const words = countWords(cleanBlock(raw));
  if (words < 25 && NAV_START.test(raw.trim())) return true;
  // Menus: several very short lines
  if (lines.length >= 3 && words / lines.length <= 4) return true;
  // UI labels: one short line that isn't a sentence ("Tools", "23 languages")
  if (lines.length === 1 && words <= 5 && !/[.!?:]\W*$/.test(raw.trim()))
    return true;
  return false;
}

/** Strips markup the judge should not see: images, link targets, URLs, HTML. */
export function cleanBlock(raw: string): string {
  return (
    raw
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      // Citation markers: [\[1\]](#cite_note-1), [[1]](#…), [1]
      .replace(/\[\\?\[[^\]]{1,20}?\\?\]\]\([^)]*\)|\[\d+\]/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\\?\[_*citation needed_*\\?\]/gi, "")
      .replace(BARE_URL_RE, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\\([\\`*_{}[\]()#+\-.!|])/g, "$1")
      .split("\n")
      .map((l) => l.replace(/[ \t]+/g, " ").trim())
      .filter(Boolean)
      .join("\n")
  );
}

interface Block {
  heading: string;
  text: string;
}

/** Markdown → cleaned blocks, each tagged with the heading above it. */
export function parseBlocks(markdown: string): Block[] {
  const md = markdown.replace(/\r\n?/g, "\n").replace(/```[\s\S]*?```/g, "\n");
  const lines = md.split("\n");
  const blocks: Block[] = [];
  let heading = "";
  let current: string[] = [];
  const seen = new Set<string>();

  const flush = () => {
    if (current.length === 0) return;
    const raw = current.join("\n");
    current = [];
    if (RELATED_HEADING.test(heading) || isBoilerplateBlock(raw)) return;
    const text = cleanBlock(raw);
    if (countWords(text) === 0) return;
    // Repeated blocks (card title + alt text, sticky CTAs) keep only the first.
    const key = normalizeForHash(text);
    if (seen.has(key)) return;
    seen.add(key);
    blocks.push({ heading, text });
  };

  for (const line of lines) {
    const atx = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (atx) {
      flush();
      heading = cleanBlock(atx[1]);
      continue;
    }
    // Setext heading: a single text line underlined with === or ---
    if (/^\s*(=+|-+)\s*$/.test(line)) {
      if (current.length === 1 && !LIST_LINE.test(current[0])) {
        heading = cleanBlock(current[0]);
        current = [];
      } else {
        flush();
      }
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();
  return blocks;
}

/**
 * "Related posts" style runs of titles: most non-bullet lines are short
 * (≤ 16 words) and end without sentence punctuation, or are truncated with
 * an ellipsis. Prose lines end in punctuation; real bullet lists are exempt.
 */
export function isHeadlineList(text: string): boolean {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !LIST_LINE.test(l));
  if (lines.length < 3) return false;
  const titleLike = lines.filter(
    (l) =>
      countWords(l) <= 16 &&
      (/(\.\.\.|…)$/.test(l) || !/[.!?:;"”')\]]$/.test(l)),
  ).length;
  return titleLike * 2 >= lines.length;
}

/** Splits an over-long chunk at sentence ends into pieces of ≤ MAX_WORDS. */
function splitLong(text: string): string[] {
  if (countWords(text) <= SPLIT_WORDS) return [text];
  const pieces: string[] = [];
  let buf: string[] = [];
  let words = 0;
  for (const sentence of splitSentences(text)) {
    const w = countWords(sentence);
    if (words > 0 && words + w > MAX_WORDS) {
      pieces.push(buf.join(" "));
      buf = [];
      words = 0;
    }
    buf.push(sentence);
    words += w;
  }
  if (buf.length) {
    const tail = buf.join(" ");
    const last = pieces[pieces.length - 1];
    if (
      words < MIN_WORDS &&
      last !== undefined &&
      countWords(last) + words <= SPLIT_WORDS
    ) {
      pieces[pieces.length - 1] += " " + tail;
    } else {
      pieces.push(tail);
    }
  }
  return pieces;
}

/**
 * Segments one page into passages. Neighbouring blocks under the same heading
 * merge until a chunk reaches 60-180 words; chunks never cross a heading.
 */
export function segmentPage(markdown: string): Block[] {
  const blocks = parseBlocks(markdown);
  const chunks: Block[] = [];
  let buf: Block | null = null;
  let bufWords = 0;

  const flush = () => {
    if (!buf) return;
    for (const piece of splitLong(buf.text)) {
      chunks.push({ heading: buf.heading, text: piece });
    }
    buf = null;
    bufWords = 0;
  };

  for (const block of blocks) {
    const w = countWords(block.text);
    if (buf && buf.heading !== block.heading) flush();
    if (buf && bufWords >= MIN_WORDS && bufWords + w > MAX_WORDS) flush();
    if (!buf) {
      buf = { heading: block.heading, text: block.text };
      bufWords = w;
    } else {
      buf.text += "\n\n" + block.text;
      bufWords += w;
    }
  }
  flush();

  return chunks.filter((c) => {
    const words = countWords(c.text);
    if (words < MIN_WORDS) return false;
    if (splitSentences(c.text).length < 3 && !isListShaped(c.text))
      return false;
    if (isHeadlineList(c.text)) return false;
    return true;
  });
}

export function queryTerms(keyword: string): string[] {
  const terms = (keyword.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (t) => !STOPWORDS.has(t),
  );
  return [...new Set(terms)];
}

function tokens(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** BM25 over one page's chunks (k1 = 1.2, b = 0.75). */
export function bm25Scores(texts: string[], keyword: string): number[] {
  const terms = queryTerms(keyword);
  const docs = texts.map(tokens);
  const avg = docs.reduce((s, d) => s + d.length, 0) / Math.max(1, docs.length);
  const n = docs.length;
  const idf = new Map<string, number>();
  for (const t of terms) {
    const df = docs.filter((d) => d.includes(t)).length;
    idf.set(t, Math.log(1 + (n - df + 0.5) / (df + 0.5)));
  }
  return docs.map((d) => {
    let score = 0;
    for (const t of terms) {
      const tf = d.filter((x) => x === t).length;
      if (tf === 0) continue;
      score +=
        (idf.get(t) ?? 0) *
        ((tf * 2.2) / (tf + 1.2 * (0.25 + (0.75 * d.length) / (avg || 1))));
    }
    return score;
  });
}

function pagePassages(
  page: ScrapedPage,
  origin: Passage["origin"],
  keyword: string,
): Passage[] {
  if (page.error || !page.fullText) return [];
  const chunks = segmentPage(page.fullText);
  const scores = bm25Scores(
    chunks.map((c) => c.text),
    keyword,
  );
  // Array.prototype.sort is stable, so ties keep page order.
  return chunks
    .map(
      (c, i): Passage => ({
        text: c.text,
        heading: c.heading,
        origin,
        domain: page.domain,
        hash: hashPassage(c.text),
        score: scores[i],
      }),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_PER_PAGE);
}

/**
 * Builds the run's passage pool: top 15 passages per page, deduped by hash,
 * ordered by query overlap. Pages with a failed scrape contribute nothing.
 */
export function buildPassagePool(input: {
  keyword: string;
  targetPage: ScrapedPage | null;
  competitorPages: ScrapedPage[];
}): { passages: Passage[]; targetUsed: boolean } {
  const target = input.targetPage
    ? pagePassages(input.targetPage, "target", input.keyword)
    : [];
  const competitors = input.competitorPages.flatMap((p) =>
    pagePassages(p, "competitor", input.keyword),
  );
  const seen = new Set<string>();
  const passages: Passage[] = [];
  for (const p of [...target, ...competitors].sort(
    (a, b) => b.score - a.score,
  )) {
    if (seen.has(p.hash)) continue;
    seen.add(p.hash);
    passages.push(p);
  }
  return { passages, targetUsed: target.length > 0 };
}

// ─── Pool expansion (SERP top 10) ───────────────────────────────────────

/** Below this, the pool is topped up from the SERP; never beyond POOL_MAX. */
export const POOL_TARGET = 40;
export const POOL_MAX = 60;
const SERP_TOP = 10;
const EXPANSION_TTL_MS = 30 * 60 * 1000;

export interface ExpandDeps {
  fetchSerp?: (keyword: string, targetUrl: string) => Promise<SerpResult>;
  scrapePages?: (urls: string[]) => Promise<ScrapedPage[]>;
}

// One SERP call + one scrape per (keyword, target, known pages), reused by
// every signal of a run. In-memory per instance, like the spend ledger.
const expansionCache = new Map<
  string,
  { at: number; pages: Promise<ScrapedPage[]> }
>();

/** Test helper. */
export function resetExpansionCache(): void {
  expansionCache.clear();
}

function urlKey(url: string): string {
  try {
    const u = new URL(url);
    return (
      u.hostname.replace(/^www\./, "").toLowerCase() +
      u.pathname.replace(/\/+$/, "")
    );
  } catch {
    return url;
  }
}

async function serpExpansionPages(
  keyword: string,
  targetUrl: string,
  known: Set<string>,
  deps: ExpandDeps,
): Promise<ScrapedPage[]> {
  const serpFn = deps.fetchSerp ?? fetchSerp;
  const scrapeFn = deps.scrapePages ?? scrapePages;
  // The SERP API regularly returns an unparsable body or times out
  // (measured: 4 of 11 calls on 2026-09-25): up to 3 attempts.
  let serp = await serpFn(keyword, targetUrl);
  for (let i = 0; i < 2 && serp.organicResults.length === 0; i++)
    serp = await serpFn(keyword, targetUrl);
  const urls = serp.organicResults
    .slice(0, SERP_TOP)
    .filter((r) => !r.isTarget && /^https?:\/\//.test(r.url))
    .map((r) => r.url)
    .filter((u) => !known.has(urlKey(u)));
  const pages: ScrapedPage[] = [];
  // scrapePages handles at most 5 URLs per call
  for (let i = 0; i < urls.length; i += 5) {
    pages.push(...(await scrapeFn(urls.slice(i, i + 5))));
  }
  return pages;
}

/**
 * Tops a pool under POOL_TARGET up with passages from the SERP top-10 organic
 * results (same segmentation and filters), up to POOL_MAX. The target page
 * and pages already in the pool are skipped. Needs BRIGHT_DATA_KEY; without
 * it, or when the SERP fails, the pool is returned unchanged.
 */
export async function expandPool(
  input: {
    keyword: string;
    targetUrl: string;
    passages: Passage[];
    knownUrls: string[];
  },
  deps: ExpandDeps = {},
): Promise<{ passages: Passage[]; added: number }> {
  const base = input.passages;
  if (base.length >= POOL_TARGET) return { passages: base, added: 0 };
  if (!deps.fetchSerp && !process.env.BRIGHT_DATA_KEY)
    return { passages: base, added: 0 };

  const known = new Set([input.targetUrl, ...input.knownUrls].map(urlKey));
  const key = [input.keyword, ...[...known].sort()].join("|");
  const now = Date.now();
  let entry = expansionCache.get(key);
  if (!entry || entry.at < now - EXPANSION_TTL_MS) {
    entry = {
      at: now,
      pages: serpExpansionPages(input.keyword, input.targetUrl, known, deps),
    };
    expansionCache.set(key, entry);
  }
  let pages: ScrapedPage[];
  try {
    pages = await entry.pages;
  } catch {
    expansionCache.delete(key);
    return { passages: base, added: 0 };
  }
  if (pages.length === 0) expansionCache.delete(key);

  const seen = new Set(base.map((p) => p.hash));
  const extra: Passage[] = [];
  for (const p of pages
    .flatMap((page) => pagePassages(page, "competitor", input.keyword))
    .sort((a, b) => b.score - a.score)) {
    if (seen.has(p.hash)) continue;
    seen.add(p.hash);
    extra.push(p);
  }
  const added = extra.slice(0, Math.max(0, POOL_MAX - base.length));
  return {
    passages: [...base, ...added].sort((a, b) => b.score - a.score),
    added: added.length,
  };
}
