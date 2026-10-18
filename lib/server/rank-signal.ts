import {
  CATALOG_VERSION,
  getSignal,
  type SignalContext,
  type SignalDef,
} from "./rank-signal-features";
import {
  REASONING_EFFORT,
  estimateCallUsd,
  judgePair,
  type ChatDeps,
} from "./rank-signal-judge";
import type { Passage } from "./rank-signal-passages";
import { buildPair } from "./rank-signal-variants";
import type {
  RankSignalExample,
  RankSignalResult,
  RankSignalTrial,
} from "./sro-types";
import {
  CHECKPOINTS,
  MAX_TRIALS,
  verdict,
  type StatVerdict,
} from "@/lib/shared/rank-signal-stats";

/**
 * Rank Signal trial loop for one signal.
 *
 * Trials run in synchronous batches of `concurrency`: the next batch goes out
 * only after the current one settles, so nothing is in flight when the
 * verdict is read at n = 20, 30 and 40. A positive or negative verdict stops
 * the signal at exactly that n.
 */

// ─── Hourly spend ledger ────────────────────────────────────────────────
// In-memory per instance, like proxy.ts: it stops bursts, it is not a global
// guarantee. A shared store (Upstash / Vercel KV) is needed for hard limits.

const HOUR_MS = 60 * 60 * 1000;
const ledger: { at: number; usd: number }[] = [];

export function hourlyCapUsd(): number {
  const raw = process.env.RANK_SIGNAL_MAX_USD_PER_HOUR;
  const v = raw ? Number(raw) : NaN;
  return Number.isFinite(v) && v >= 0 ? v : 10;
}

export function hourlySpentUsd(now = Date.now()): number {
  while (ledger.length && ledger[0].at <= now - HOUR_MS) ledger.shift();
  return ledger.reduce((s, e) => s + e.usd, 0);
}

export function hourlyCapRemainingUsd(now = Date.now()): number {
  return Math.max(0, hourlyCapUsd() - hourlySpentUsd(now));
}

export function recordSpend(usd: number, now = Date.now()): void {
  if (usd > 0) ledger.push({ at: now, usd });
}

/** Test helper. */
export function resetSpendLedger(): void {
  ledger.length = 0;
}

// ─── Runner ─────────────────────────────────────────────────────────────

/** Absolute per-request ceiling, whatever the client asks for. */
export const MAX_RUN_USD = 5;

export interface RunSignalOptions {
  runId: string;
  signalId: string;
  keyword: string;
  targetUrl: string;
  passages: Passage[];
  concurrency: number;
  /** Already clamped by the caller to min(request, $5, hourly remaining). */
  budgetUsd: number;
  judgeModel: string;
  rewriteModel: string;
  now?: Date;
  retryDelaysMs?: number[];
  /** Lower cap on valid trials (smoke tests); never above 40. */
  maxTrials?: number;
  /** Passages that came from the SERP top-10 expansion (reported on start). */
  poolFromSerp?: number;
}

export type RankSignalEmit = (type: string, data: unknown) => void;

export interface ProgressEvent {
  n: number;
  wins: number;
  invalid: number;
  rejectedPairs: number;
  skipped: number;
  costUsd: number;
  /** Trials settled in this batch, so a stopped run keeps its tally. */
  trials: RankSignalTrial[];
}

type SlotResult =
  | {
      kind: "trial";
      trial: RankSignalTrial;
      failed: boolean;
      example?: RankSignalExample;
    }
  | { kind: "skip" }
  | { kind: "rejected"; failed: boolean }
  | { kind: "aborted" };

const MAX_CONSECUTIVE_FAILURES = 5;
const MIN_POOL = 20;

export async function runSignal(
  opts: RunSignalOptions,
  emit: RankSignalEmit,
  abortSignal: AbortSignal,
): Promise<RankSignalResult | null> {
  const found = getSignal(opts.signalId);
  if (!found) {
    emit("error", { message: `Unknown signal: ${opts.signalId}` });
    return null;
  }
  const signal: SignalDef = found;
  const pool = opts.passages;
  if (pool.length < MIN_POOL) {
    emit("error", {
      message: `page too short (${pool.length} passages; need ${MIN_POOL})`,
    });
    return null;
  }

  const ctx: SignalContext = {
    keyword: opts.keyword,
    now: opts.now ?? new Date(),
  };
  const maxN = Math.min(opts.maxTrials ?? MAX_TRIALS, MAX_TRIALS, pool.length);
  const startedAt = new Date().toISOString();
  const trials: RankSignalTrial[] = [];
  const examples: RankSignalExample[] = [];
  let rejectedPairs = 0;
  let skipped = 0;
  let costUsd = 0;
  let cursor = 0;
  let consecutiveFailures = 0;
  let slotsRun = 0;
  const checkpointsRead = new Set<number>();
  let endReason: RankSignalResult["endReason"] = "pool_exhausted";

  const deps: ChatDeps = {
    retryDelaysMs: opts.retryDelaysMs,
    onCost: (usd) => {
      costUsd += usd;
      recordSpend(usd);
    },
  };

  const nominalSlotUsd =
    estimateCallUsd(opts.judgeModel, 700, 300) +
    (signal.build === "llm" ? estimateCallUsd(opts.rewriteModel, 600, 500) : 0);

  const valid = () => trials.filter((t) => t.outcome !== "invalid");
  const wins = () => trials.filter((t) => t.outcome === "win").length;

  emit("start", {
    signalId: signal.id,
    poolSize: pool.length,
    poolFromSerp: opts.poolFromSerp ?? 0,
    maxN,
    judgeModel: opts.judgeModel,
    rewriteModel: opts.rewriteModel,
  });

  async function runSlot(
    passage: Passage,
    featureSide: "A" | "B",
  ): Promise<SlotResult> {
    try {
      const pair = await buildPair(
        signal,
        passage.text,
        ctx,
        opts.rewriteModel,
        abortSignal,
        deps,
      );
      if (pair.kind === "skip") return { kind: "skip" };
      if (pair.kind === "rejected") return { kind: "rejected", failed: false };
      if (pair.kind === "failed") return { kind: "rejected", failed: true };

      const [a, b] =
        featureSide === "A"
          ? [pair.with, pair.without]
          : [pair.without, pair.with];
      const judged = await judgePair(
        { keyword: opts.keyword, a, b, model: opts.judgeModel },
        abortSignal,
        deps,
      );
      const outcome: RankSignalTrial["outcome"] =
        judged.choice === null
          ? "invalid"
          : judged.choice === featureSide
            ? "win"
            : "loss";
      return {
        kind: "trial",
        failed: judged.failed,
        trial: {
          passageHash: passage.hash,
          origin: passage.origin,
          direction: pair.direction,
          featureSide,
          outcome,
        },
        example: {
          signalId: signal.id,
          direction: pair.direction,
          with: pair.with,
          without: pair.without,
        },
      };
    } catch (err) {
      if (abortSignal.aborted) return { kind: "aborted" };
      throw err;
    }
  }

  while (true) {
    if (abortSignal.aborted) {
      endReason = "aborted";
      break;
    }
    const n = valid().length;
    if (n >= maxN) {
      endReason = "max_trials";
      break;
    }
    if (cursor >= pool.length) {
      endReason = "pool_exhausted";
      break;
    }

    // Never overshoot the next checkpoint (or maxN): verdicts are read at
    // exactly n = 20 / 30 / 40 when no slot is skipped or invalid.
    const nextStop = Math.min(CHECKPOINTS.find((c) => c > n) ?? maxN, maxN);
    let size = Math.min(opts.concurrency, pool.length - cursor, nextStop - n);

    // Budget: stop dispatching once spent + in-flight estimate reaches the cap.
    const perSlot = Math.max(nominalSlotUsd, slotsRun ? costUsd / slotsRun : 0);
    const available = Math.min(
      opts.budgetUsd - costUsd,
      hourlyCapRemainingUsd(),
    );
    while (size > 0 && perSlot * size > available) size--;
    if (size === 0) {
      endReason = "budget";
      break;
    }

    // Position: alternate the feature side by slot, starting on the side
    // with fewer valid placements so far.
    const validNow = valid();
    const onA = validNow.filter((t) => t.featureSide === "A").length;
    const startSide: "A" | "B" = onA <= validNow.length - onA ? "A" : "B";
    const other: "A" | "B" = startSide === "A" ? "B" : "A";

    const batch = pool.slice(cursor, cursor + size);
    cursor += size;
    const results = await Promise.all(
      batch.map((p, j) => runSlot(p, j % 2 === 0 ? startSide : other)),
    );
    slotsRun += size;

    const newTrials: RankSignalTrial[] = [];
    for (const r of results) {
      if (r.kind === "aborted") continue;
      if (r.kind === "skip") {
        skipped++;
        continue;
      }
      if (r.kind === "rejected") {
        rejectedPairs++;
        consecutiveFailures = r.failed ? consecutiveFailures + 1 : 0;
        continue;
      }
      consecutiveFailures = r.failed ? consecutiveFailures + 1 : 0;
      trials.push(r.trial);
      newTrials.push(r.trial);
      if (r.example && examples.length < 2) examples.push(r.example);
    }

    if (abortSignal.aborted) {
      endReason = "aborted";
      break;
    }

    const nAfter = valid().length;
    const progress: ProgressEvent = {
      n: nAfter,
      wins: wins(),
      invalid: trials.length - nAfter,
      rejectedPairs,
      skipped,
      costUsd,
      trials: newTrials,
    };
    emit("progress", progress);

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      endReason = "error";
      break;
    }

    const crossed = CHECKPOINTS.filter(
      (c) => c <= nAfter && !checkpointsRead.has(c),
    );
    if (crossed.length) {
      for (const c of crossed) checkpointsRead.add(c);
      const v: StatVerdict = verdict(wins(), nAfter);
      emit("checkpoint", { n: nAfter, wins: wins(), verdict: v });
      if (v === "positive" || v === "negative") {
        endReason = "verdict";
        break;
      }
    }
  }

  const result: RankSignalResult = {
    runId: opts.runId,
    signalId: signal.id,
    catalogVersion: CATALOG_VERSION,
    judgeModel: opts.judgeModel,
    rewriteModel: opts.rewriteModel,
    reasoningEffort: REASONING_EFFORT,
    targetUrl: opts.targetUrl,
    keyword: opts.keyword,
    startedAt,
    finishedAt: new Date().toISOString(),
    trials,
    rejectedPairs,
    skipped,
    costUsd,
    endReason,
  };
  emit("signal_done", { result, examples });
  return result;
}
