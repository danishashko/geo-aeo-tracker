/**
 * Rank Signal step-0 pool gate.
 *
 * For each URL+keyword pair: fetch the SERP, scrape the target + top 3
 * competitors, build the passage pool, top it up from the SERP top 10 when it
 * is under 40 (as the route does), and print the pool sizes plus the eligible
 * passages per signal after the catalog's skip rules.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/rank-signal-pool.ts \
 *     "https://example.com/page|keyword" ... [--out pages.json]
 *
 * Needs BRIGHT_DATA_KEY (SERP + Web Unlocker). Makes no LLM calls.
 */
import { writeFileSync } from "node:fs";
import { fetchSerp } from "../lib/server/serp";
import { scrapePage, scrapePages } from "../lib/server/unlocker";
import {
  buildPassagePool,
  expandPool,
} from "../lib/server/rank-signal-passages";
import {
  FEATURE_CATALOG,
  isEligible,
} from "../lib/server/rank-signal-features";
import type { ScrapedPage } from "../lib/server/sro-types";

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
  const pairs = args
    .filter((a, i) => a !== "--out" && i !== outIdx + 1)
    .map((a) => {
      const [url, keyword] = a.split("|");
      return { url, keyword };
    })
    .filter((p) => p.url && p.keyword);

  if (!process.env.BRIGHT_DATA_KEY) {
    console.error("BRIGHT_DATA_KEY is not set");
    process.exit(1);
  }
  if (pairs.length === 0) {
    console.error('Pass one or more "url|keyword" arguments');
    process.exit(1);
  }

  const now = new Date();
  const eligible: Record<string, number[]> = {};
  const rawPools: number[] = [];
  const basePools: number[] = [];
  const saved: {
    url: string;
    keyword: string;
    targetPage: ScrapedPage;
    competitorPages: ScrapedPage[];
  }[] = [];

  for (const { url, keyword } of pairs) {
    const serp = await fetchSerp(keyword, url);
    const [targetPage, competitorPages] = await Promise.all([
      scrapePage(url),
      scrapePages(serp.topCompetitors.slice(0, 3)),
    ]);
    saved.push({ url, keyword, targetPage, competitorPages });

    const base = buildPassagePool({ keyword, targetPage, competitorPages });
    const targetUsed = base.targetUsed;
    // Same expansion the route runs: SERP top 10 when the pool is under 40.
    const { passages, added } = await expandPool(
      {
        keyword,
        targetUrl: url,
        passages: base.passages,
        knownUrls: [url, ...competitorPages.map((p) => p.url)],
      },
      // Reuse this pair's SERP; refetch only if it came back empty.
      {
        fetchSerp: async (k, u) =>
          serp.organicResults.length ? serp : fetchSerp(k, u),
        scrapePages,
      },
    );
    basePools.push(base.passages.length);
    rawPools.push(passages.length);
    const pages = [targetPage, ...competitorPages]
      .map(
        (p) =>
          `${p.domain}${p.error ? " (scrape failed)" : ` ${p.wordCount}w`}`,
      )
      .join(", ");
    console.log(`\n${keyword} — ${url}`);
    console.log(`  pages: ${pages}`);
    console.log(
      `  raw pool: ${base.passages.length} from target + top 3 (target ${passages.filter((p) => p.origin === "target").length}${targetUsed ? "" : ", target unusable"}); ${passages.length} after SERP top-10 expansion (+${added})`,
    );
    const row: string[] = [];
    for (const signal of FEATURE_CATALOG) {
      const n = passages.filter((p) =>
        isEligible(signal, p.text, { keyword, now }),
      ).length;
      (eligible[signal.id] ??= []).push(n);
      row.push(`${signal.id}=${n}`);
    }
    console.log(`  eligible: ${row.join(" ")}`);
  }

  console.log("\n=== Summary ===");
  console.log(
    `raw pool per page (target + top 3): ${basePools.join(", ")} (median ${median(basePools)})`,
  );
  console.log(
    `pool after SERP top-10 expansion: ${rawPools.join(", ")} (median ${median(rawPools)})`,
  );
  let atLeast40 = 0;
  for (const signal of FEATURE_CATALOG) {
    const m = median(eligible[signal.id]);
    if (m >= 40) atLeast40++;
    console.log(
      `${signal.id} ${signal.build.padEnd(4)} median eligible ${String(m).padStart(4)}  [${eligible[signal.id].join(", ")}]`,
    );
  }
  console.log(
    `signals with median eligible >= 40: ${atLeast40}/${FEATURE_CATALOG.length}`,
  );

  if (outPath) {
    writeFileSync(outPath, JSON.stringify(saved));
    console.log(`\nsaved scraped pages to ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
