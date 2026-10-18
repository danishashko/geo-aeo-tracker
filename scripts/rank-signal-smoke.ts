/**
 * Rank Signal live smoke test: runs S00, S06 and S02 at maxN = 20 on one real
 * page with the real judge and rewriter, and prints n, wins, verdict and cost.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/rank-signal-smoke.ts "https://example.com/page|keyword"
 *   npx tsx --env-file=.env scripts/rank-signal-smoke.ts --pages pages.json [index]
 *   add --max 40 for 40 trials per signal (default 20)
 *
 * `--pages` reuses the JSON written by `rank-signal-pool.ts --out` (no
 * re-scrape). Needs OPENROUTER_KEY, plus BRIGHT_DATA_KEY when scraping.
 * Spend: roughly $0.25 at maxN 20 with the default models (capped at $0.25
 * per signal per 20 trials).
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fetchSerp } from "../lib/server/serp";
import { scrapePage, scrapePages } from "../lib/server/unlocker";
import {
  buildPassagePool,
  expandPool,
} from "../lib/server/rank-signal-passages";
import {
  judgeModelFromEnv,
  modelProblem,
  rewriteModelFromEnv,
} from "../lib/server/rank-signal-judge";
import { runSignal } from "../lib/server/rank-signal";
import { posterior, verdict } from "../lib/shared/rank-signal-stats";
import type { ScrapedPage } from "../lib/server/sro-types";

const SIGNALS = ["S00", "S06", "S02"];

async function loadInput(args: string[]): Promise<{
  url: string;
  keyword: string;
  targetPage: ScrapedPage;
  competitorPages: ScrapedPage[];
}> {
  const pagesIdx = args.indexOf("--pages");
  if (pagesIdx >= 0) {
    const saved = JSON.parse(readFileSync(args[pagesIdx + 1], "utf8"));
    return saved[Number(args[pagesIdx + 2] ?? 0)];
  }
  const [url, keyword] = (args[0] ?? "").split("|");
  if (!url || !keyword) throw new Error('Pass "url|keyword" or --pages file');
  const serp = await fetchSerp(keyword, url);
  const [targetPage, competitorPages] = await Promise.all([
    scrapePage(url),
    scrapePages(serp.topCompetitors.slice(0, 3)),
  ]);
  return { url, keyword, targetPage, competitorPages };
}

async function main() {
  if (!process.env.OPENROUTER_KEY) throw new Error("OPENROUTER_KEY is not set");
  const judgeModel = judgeModelFromEnv();
  const rewriteModel = rewriteModelFromEnv();
  for (const m of [judgeModel, rewriteModel]) {
    const problem = modelProblem(m);
    if (problem) throw new Error(problem);
  }

  const args = process.argv.slice(2);
  const maxIdx = args.indexOf("--max");
  const maxTrials = maxIdx >= 0 ? Number(args[maxIdx + 1]) || 20 : 20;
  const input = await loadInput(args);
  const base = buildPassagePool(input);
  // Same SERP top-10 expansion the route runs when the pool is under 40
  const { passages, added } = await expandPool({
    keyword: input.keyword,
    targetUrl: input.url,
    passages: base.passages,
    knownUrls: [input.url, ...input.competitorPages.map((p) => p.url)],
  });
  console.log(`${input.keyword} — ${input.url}`);
  console.log(
    `pool ${passages.length} passages (${added} from SERP top 10); maxN ${maxTrials}; judge ${judgeModel}; rewriter ${rewriteModel}`,
  );

  const runId = randomUUID();
  const t0 = Date.now();
  let total = 0;
  for (const signalId of SIGNALS) {
    const started = Date.now();
    const result = await runSignal(
      {
        runId,
        signalId,
        keyword: input.keyword,
        targetUrl: input.url,
        passages,
        concurrency: 4,
        budgetUsd: 0.25 * (maxTrials / 20),
        judgeModel,
        rewriteModel,
        maxTrials,
      },
      (type, data) => {
        if (type === "error") console.log(`  ${signalId} error:`, data);
      },
      new AbortController().signal,
    );
    if (!result) continue;
    const valid = result.trials.filter((t) => t.outcome !== "invalid");
    const n = valid.length;
    const wins = valid.filter((t) => t.outcome === "win").length;
    const p = posterior(wins, n);
    const add = result.trials.filter((t) => t.direction === "add").length;
    total += result.costUsd;
    console.log(
      `${signalId}: n=${n} wins=${wins} verdict=${verdict(wins, n)} mean=${(p.mean * 100).toFixed(1)}% ci=[${(p.lo * 100).toFixed(1)}, ${(p.hi * 100).toFixed(1)}] ` +
        `invalid=${result.trials.length - n} rejected=${result.rejectedPairs} skipped=${result.skipped} add/remove=${add}/${result.trials.length - add} ` +
        `cost=$${result.costUsd.toFixed(4)} ($${(result.costUsd / Math.max(1, result.trials.length)).toFixed(5)}/trial) ` +
        `end=${result.endReason} ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );
  }
  console.log(
    `total cost $${total.toFixed(4)}; duration ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
