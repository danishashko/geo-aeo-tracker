// BLUF (Bottom Line Up Front) check used by /api/audit.
const DIRECT_ANSWER =
  /\b(in short|tl;dr|summary|key takeaways|bottom line|the answer is|here('?s| is) (what|how|why))\b/i;

export type BlufResult = {
  /** Passes only when the opening text uses a direct-answer phrase. */
  pass: boolean;
  /** The phrase found in the opening text, or null. */
  directAnswer: string | null;
  /** 0-1 blend of direct answer, lists and opening length (kept for blufDensity). */
  density: number;
};

export function checkBluf(plain: string, html: string): BlufResult {
  const firstChunkLen = Math.max(plain.length * 0.2, 400);
  const firstChunk = plain.slice(0, Math.floor(firstChunkLen));
  const bulletCount = (html.match(/<li\b/gi) ?? []).length;
  const directAnswer = firstChunk.match(DIRECT_ANSWER)?.[0] ?? null;
  const density = Math.min(
    1,
    (Number(directAnswer !== null) +
      Number(bulletCount > 3) +
      Number(firstChunk.length > 100)) /
      2,
  );
  return { pass: directAnswer !== null, directAnswer, density };
}
