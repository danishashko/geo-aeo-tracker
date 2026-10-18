"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  RankSignalExample,
  RankSignalResult,
  RankSignalTrial,
  ScrapedPage,
} from "@/lib/server/sro-types";
import { posterior, verdict } from "@/lib/shared/rank-signal-stats";
import {
  loadSovereignValue,
  saveSovereignValue,
} from "@/lib/client/sovereign-store";
import { readSse } from "@/lib/client/sse";

const RESULTS_KEY = "rank-signal-v1";
const EXAMPLES_KEY = "rank-signal-examples-v1";
const MAX_STORED_RESULTS = 150;
const DEFAULT_CAP_USD = 5;

interface SignalMeta {
  id: string;
  name: string;
  build: "code" | "llm";
}

interface PanelConfig {
  catalogVersion: number;
  judgeModel: string;
  rewriteModel: string;
  allowedModels: string[];
  maxRunUsd: number;
  signals: SignalMeta[];
}

interface StoredExamples {
  runId: string;
  examples: Record<string, RankSignalExample[]>;
}

interface Row {
  key: string;
  id: string;
  name: string;
  build: "code" | "llm" | null;
  n: number;
  wins: number;
  endReason: RankSignalResult["endReason"] | null;
  trials: RankSignalTrial[];
  rejectedPairs: number;
  skipped: number;
  meta?: string;
}

interface LiveState {
  signalId: string;
  n: number;
  maxN: number;
  poolSize: number;
  fromSerp: number;
  spent: number;
}

/* ── Demo seed: DEJAN AI's published sample (dejan.ai/optimizer-sample),
      relabelled D01-D17 so it can't be confused with our S-IDs ── */
const DEMO_ROWS: [number, number][] = [
  [190, 190],
  [195, 191],
  [196, 180],
  [191, 174],
  [187, 167],
  [198, 166],
  [194, 147],
  [154, 116],
  [198, 131],
  [191, 98],
  [195, 96],
  [194, 93],
  [176, 66],
  [195, 67],
  [170, 54],
  [197, 62],
  [185, 6],
];

const DEMO_TABLE: Row[] = DEMO_ROWS.map(([n, wins], i) => {
  const id = `D${String(i + 1).padStart(2, "0")}`;
  return {
    key: id,
    id,
    name: "",
    build: null,
    n,
    wins,
    endReason: null,
    trials: [],
    rejectedPairs: 0,
    skipped: 0,
  };
});

// ── Derivations (never stored) ───────────────────────────

function counts(trials: RankSignalTrial[]) {
  const valid = trials.filter((t) => t.outcome !== "invalid");
  return {
    n: valid.length,
    wins: valid.filter((t) => t.outcome === "win").length,
  };
}

/** The judge picked A: feature on A and it won, or feature on B and it lost. */
function choseA(t: RankSignalTrial): boolean {
  return (
    (t.featureSide === "A" && t.outcome === "win") ||
    (t.featureSide === "B" && t.outcome === "loss")
  );
}

const REASON_TEXT: Record<RankSignalResult["endReason"], string> = {
  verdict: "verdict",
  max_trials: "pool exhausted",
  pool_exhausted: "pool exhausted",
  budget: "budget",
  aborted: "stopped",
  error: "error",
};

type Tone = "accent" | "danger" | "muted";

function toneColor(tone: Tone): string {
  return tone === "accent"
    ? "var(--th-accent)"
    : tone === "danger"
      ? "var(--th-danger)"
      : "var(--th-text-muted)";
}

function verdictLabel(
  row: Row,
  pooled: boolean,
): { text: string; tone: Tone; title: string } {
  if (pooled) {
    return { text: "—", tone: "muted", title: "Pooled: no stop decision" };
  }
  const v = verdict(row.wins, row.n);
  const tone: Tone =
    v === "positive" ? "accent" : v === "negative" ? "danger" : "muted";
  if (v === "positive" || v === "negative")
    return { text: v, tone, title: `${v} at n=${row.n}` };
  if (v === "no_clear_effect")
    return {
      text: `no clear effect (n=${row.n})`,
      tone,
      title: `No clear effect at n=${row.n}`,
    };
  const reason = row.endReason ? REASON_TEXT[row.endReason] : "stopped";
  return {
    text: `inconclusive (${reason})`,
    tone,
    title: `Inconclusive: ${reason} at n=${row.n}`,
  };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}`;
}

function resultToRow(r: RankSignalResult, meta?: SignalMeta): Row {
  const { n, wins } = counts(r.trials);
  return {
    key: r.signalId,
    id: r.signalId,
    name: meta?.name ?? "",
    build: meta?.build ?? null,
    n,
    wins,
    endReason: r.endReason,
    trials: r.trials,
    rejectedPairs: r.rejectedPairs,
    skipped: r.skipped,
  };
}

/** "All runs": pooled per (signal, judge, rewriter, catalog), deduped by (passage, keyword, direction), latest trial kept. */
function pooledRows(
  results: RankSignalResult[],
  metaById: Map<string, SignalMeta>,
): Row[] {
  const groups = new Map<
    string,
    {
      r: RankSignalResult;
      trials: Map<string, RankSignalTrial>;
      rejected: number;
      skipped: number;
    }
  >();
  // results are newest first, so the first trial seen per key is the latest
  for (const r of results) {
    const gk = [
      r.signalId,
      r.judgeModel,
      r.rewriteModel,
      r.catalogVersion,
    ].join("|");
    let g = groups.get(gk);
    if (!g) {
      g = { r, trials: new Map(), rejected: 0, skipped: 0 };
      groups.set(gk, g);
    }
    g.rejected += r.rejectedPairs;
    g.skipped += r.skipped;
    for (const t of r.trials) {
      const tk = [t.passageHash, r.keyword, t.direction].join("|");
      if (!g.trials.has(tk)) g.trials.set(tk, t);
    }
  }
  return [...groups.entries()].map(([gk, g]) => {
    const trials = [...g.trials.values()];
    const { n, wins } = counts(trials);
    const meta = metaById.get(g.r.signalId);
    return {
      key: gk,
      id: g.r.signalId,
      name: meta?.name ?? "",
      build: meta?.build ?? null,
      n,
      wins,
      endReason: null,
      trials,
      rejectedPairs: g.rejected,
      skipped: g.skipped,
      meta: `judge ${g.r.judgeModel} · rewriter ${g.r.rewriteModel} · catalog v${g.r.catalogVersion}`,
    };
  });
}

// ── Small pieces ─────────────────────────────────────────

function CiBar({ wins, n, tone }: { wins: number; n: number; tone: Tone }) {
  const p = posterior(wins, n);
  // Clamp to [0, 100] and round, so server and client render identical SVG
  // attributes (the last float digits of the beta quantile can differ).
  const clamp = (x: number) =>
    Math.round(Math.max(0, Math.min(100, x * 100)) * 100) / 100;
  const lo = clamp(p.lo);
  const hi = clamp(p.hi);
  const mean = clamp(p.mean);
  // Printed values come from the unrounded posterior.
  const text = `[${pct(p.lo)}, ${pct(p.hi)}] ±${(((p.hi - p.lo) / 2) * 100).toFixed(1)} pp`;
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <svg
        viewBox="0 0 100 12"
        preserveAspectRatio="none"
        className="h-3 w-full min-w-0 sm:flex-1"
        role="img"
        aria-label={`95% interval ${pct(p.lo)} to ${pct(p.hi)} percent, mean ${pct(p.mean)} percent`}
      >
        <rect
          x="0"
          y="5"
          width="100"
          height="2"
          rx="1"
          fill="var(--th-border)"
        />
        <rect
          x={lo}
          y="3"
          width={Math.max(hi - lo, 0.4)}
          height="6"
          rx="1"
          fill={toneColor(tone)}
        />
        <line
          x1="50"
          x2="50"
          y1="0"
          y2="12"
          stroke="var(--th-text-secondary)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={mean}
          x2={mean}
          y1="1"
          y2="11"
          stroke="var(--th-text)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-th-text-secondary">
        {text}
      </span>
    </div>
  );
}

function VerdictCell({ row, pooled }: { row: Row; pooled: boolean }) {
  const label = verdictLabel(row, pooled);
  return (
    <span
      className="inline-flex items-center gap-1.5 text-sm text-th-text"
      title={label.title}
    >
      {!pooled && (
        <span
          aria-hidden
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: toneColor(label.tone) }}
        />
      )}
      {label.text}
    </span>
  );
}

// ── Main component ───────────────────────────────────────

export function RankSignalPanel({
  targetUrl,
  keyword,
  targetPage,
  competitorPages,
  demoMode = false,
}: {
  targetUrl: string;
  keyword: string;
  targetPage: ScrapedPage | null;
  competitorPages: ScrapedPage[];
  demoMode?: boolean;
}) {
  const [config, setConfig] = useState<PanelConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [capUsd, setCapUsd] = useState(DEFAULT_CAP_USD);
  const [judgeModel, setJudgeModel] = useState("");
  const [results, setResults] = useState<RankSignalResult[]>([]);
  const [examples, setExamples] = useState<StoredExamples>({
    runId: "",
    examples: {},
  });
  const [runId, setRunId] = useState("");
  const [view, setView] = useState<"run" | "all">("run");
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<LiveState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<RankSignalResult[]>([]);

  const targetUsable = Boolean(
    targetPage && !targetPage.error && targetPage.fullText,
  );

  // Config (signal list, models) + stored results
  useEffect(() => {
    if (demoMode) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/rank-signal");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const cfg = (await res.json()) as PanelConfig;
        if (cancelled) return;
        setConfig(cfg);
        setSelected(new Set(cfg.signals.map((s) => s.id)));
        setJudgeModel(cfg.judgeModel);
        setCapUsd(Math.min(DEFAULT_CAP_USD, cfg.maxRunUsd));
      } catch (err) {
        if (!cancelled)
          setConfigError(err instanceof Error ? err.message : String(err));
      }
      const stored = await loadSovereignValue<{ results: RankSignalResult[] }>(
        RESULTS_KEY,
        { results: [] },
      );
      const ex = await loadSovereignValue<StoredExamples>(EXAMPLES_KEY, {
        runId: "",
        examples: {},
      });
      if (cancelled) return;
      resultsRef.current = stored.results ?? [];
      setResults(resultsRef.current);
      setRunId(resultsRef.current[0]?.runId ?? "");
      setExamples(ex);
    })();
    return () => {
      cancelled = true;
    };
  }, [demoMode]);

  const metaById = useMemo(
    () => new Map((config?.signals ?? []).map((s) => [s.id, s])),
    [config],
  );

  const persist = useCallback(async (result: RankSignalResult) => {
    const next = [result, ...resultsRef.current].slice(0, MAX_STORED_RESULTS);
    resultsRef.current = next;
    setResults(next);
    await saveSovereignValue(RESULTS_KEY, { results: next });
  }, []);

  const run = useCallback(async () => {
    if (!config) return;
    const id = crypto.randomUUID();
    const ac = new AbortController();
    abortRef.current = ac;
    setRunId(id);
    setView("run");
    setRunning(true);
    setError(null);
    setNotice(null);
    setOpenRow(null);

    const runExamples: Record<string, RankSignalExample[]> = {};
    const order = config.signals
      .map((s) => s.id)
      .filter((s) => selected.has(s));
    const page = (p: ScrapedPage) => ({
      url: p.url,
      domain: p.domain,
      fullText: p.fullText.slice(0, 200_000),
      ...(p.error ? { error: p.error } : {}),
    });
    const target = targetPage
      ? page(targetPage)
      : { url: targetUrl, fullText: "", error: "not scraped" };
    const competitors = competitorPages
      .filter((p) => /^https?:\/\//.test(p.url))
      .slice(0, 3)
      .map(page);
    let spent = 0;

    for (const signalId of order) {
      const remaining = Math.round((capUsd - spent) * 10_000) / 10_000;
      if (remaining < 0.01) {
        setNotice("Cost cap reached. The remaining signals were not run.");
        break;
      }
      const startedAt = new Date().toISOString();
      const partial: RankSignalResult = {
        runId: id,
        signalId,
        catalogVersion: config.catalogVersion,
        judgeModel,
        rewriteModel: config.rewriteModel,
        reasoningEffort: "low",
        targetUrl,
        keyword,
        startedAt,
        finishedAt: startedAt,
        trials: [],
        rejectedPairs: 0,
        skipped: 0,
        costUsd: 0,
        endReason: "aborted",
      };
      const outcome: { done: RankSignalResult | null; error: string | null } = {
        done: null,
        error: null,
      };
      setLive({ signalId, n: 0, maxN: 0, poolSize: 0, fromSerp: 0, spent });

      try {
        const res = await fetch("/api/rank-signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId: id,
            targetUrl,
            keyword,
            signalId,
            targetPage: target,
            competitorPages: competitors,
            budgetRemainingUsd: Math.min(remaining, config.maxRunUsd),
            judgeModel,
          }),
          signal: ac.signal,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(body.error ?? `Request failed (HTTP ${res.status})`);
          break;
        }
        await readSse(res, (type, data) => {
          const d = data as Record<string, unknown>;
          if (type === "start") {
            setLive({
              signalId,
              n: 0,
              maxN: Number(d.maxN) || 0,
              poolSize: Number(d.poolSize) || 0,
              fromSerp: Number(d.poolFromSerp) || 0,
              spent,
            });
          } else if (type === "progress") {
            partial.trials.push(...((d.trials as RankSignalTrial[]) ?? []));
            partial.rejectedPairs = Number(d.rejectedPairs) || 0;
            partial.skipped = Number(d.skipped) || 0;
            partial.costUsd = Number(d.costUsd) || 0;
            setLive((prev) =>
              prev
                ? {
                    ...prev,
                    n: Number(d.n) || 0,
                    spent: spent + partial.costUsd,
                  }
                : prev,
            );
          } else if (type === "signal_done") {
            outcome.done = d.result as RankSignalResult;
            runExamples[signalId] = (d.examples as RankSignalExample[]) ?? [];
          } else if (type === "error") {
            outcome.error = String(d.message ?? "Unknown error");
          }
        });
      } catch (err) {
        if (!ac.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err));
          break;
        }
      }

      if (ac.signal.aborted) {
        partial.finishedAt = new Date().toISOString();
        spent += partial.costUsd;
        await persist(partial);
        break;
      }
      if (outcome.error) {
        setError(outcome.error);
        break;
      }
      if (outcome.done) {
        spent += outcome.done.costUsd;
        await persist(outcome.done);
      }
    }

    const ex = { runId: id, examples: runExamples };
    setExamples(ex);
    await saveSovereignValue(EXAMPLES_KEY, ex);
    abortRef.current = null;
    setLive(null);
    setRunning(false);
  }, [
    capUsd,
    competitorPages,
    config,
    judgeModel,
    keyword,
    persist,
    selected,
    targetPage,
    targetUrl,
  ]);

  const stop = useCallback(() => abortRef.current?.abort(), []);
  // A new SRO analysis unmounts the panel: stop paying for a run nobody sees.
  useEffect(() => () => abortRef.current?.abort(), []);

  // ── Rows for the current view ──
  const pooled = view === "all" && !demoMode;
  const rows: Row[] = useMemo(() => {
    const base = demoMode
      ? DEMO_TABLE
      : pooled
        ? pooledRows(results, metaById)
        : results
            .filter((r) => r.runId === runId)
            .map((r) => resultToRow(r, metaById.get(r.signalId)));
    return [...base].sort(
      (a, b) => posterior(b.wins, b.n).mean - posterior(a.wins, a.n).mean,
    );
  }, [demoMode, pooled, results, runId, metaById]);

  const thisRun = results.filter((r) => r.runId === runId);
  const runSpent = thisRun.reduce((s, r) => s + r.costUsd, 0);

  // S00 calibration line + "within edit-bias range" notes
  const placebo = rows.find((r) => r.id === "S00" && r.n > 0);
  const placeboCi = placebo ? posterior(placebo.wins, placebo.n) : null;
  const editBiasPp = placeboCi
    ? Math.max(Math.abs(placeboCi.lo - 0.5), Math.abs(placeboCi.hi - 0.5)) * 100
    : 0;
  const withinEditBias = (row: Row) => {
    if (!placeboCi || row.id === "S00" || row.build !== "llm" || row.n === 0)
      return false;
    const p = posterior(row.wins, row.n);
    return p.lo <= placeboCi.hi && p.hi >= placeboCi.lo;
  };

  // Diagnostics
  const diagRows = rows.filter(
    (r) => r.trials.length || r.rejectedPairs || r.skipped,
  );
  const allValid = diagRows.flatMap((r) =>
    r.trials.filter((t) => t.outcome !== "invalid"),
  );
  const overallA = allValid.length
    ? allValid.filter(choseA).length / allValid.length
    : 0;
  const positionWarning =
    allValid.length >= 60 && (overallA < 0.35 || overallA > 0.65);

  // Runs need a finished SRO analysis (its scraped pages). Without one the
  // card only shows stored results, and hides itself when there are none.
  const ready = Boolean(targetPage || competitorPages.length > 0);
  const canRun =
    !demoMode &&
    ready &&
    !running &&
    Boolean(config) &&
    Boolean(keyword) &&
    Boolean(targetUrl);

  if (!demoMode && !ready && results.length === 0) return null;

  return (
    <div className="rounded-xl border border-th-border bg-th-card p-4 shadow-sm">
      <div className="text-sm font-semibold text-th-text">Rank Signal</div>
      <p className="mt-0.5 text-xs leading-relaxed text-th-text-secondary">
        Paired A/B tests: does one text feature change which passage the model
        picks?
      </p>

      {demoMode && (
        <p className="mt-2 text-xs text-th-text-muted">
          Example data: DEJAN AI&apos;s published sample, Gemini 3.6 Flash,
          signal names withheld
        </p>
      )}

      {/* Controls */}
      {!demoMode && ready && (
        <div className="mt-3 space-y-3">
          {configError && (
            <div className="rounded-lg border border-th-danger/30 bg-th-danger-soft px-3 py-2 text-xs text-th-danger">
              Could not load Rank Signal settings: {configError}
            </div>
          )}
          {!targetUsable && (
            <p className="text-xs text-th-text-secondary">
              The target page could not be scraped, so this runs on competitor
              passages only.
            </p>
          )}
          {config && (
            <fieldset disabled={running} className="min-w-0">
              <legend className="mb-1.5 text-[10px] uppercase tracking-wider text-th-text-muted">
                Signals
              </legend>
              <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                {config.signals.map((s) => (
                  <label
                    key={s.id}
                    className="flex min-w-0 items-start gap-2 text-xs text-th-text-secondary"
                  >
                    <input
                      type="checkbox"
                      name="rank-signal-signals"
                      value={s.id}
                      className="mt-0.5 shrink-0 accent-th-accent"
                      checked={s.id === "S00" || selected.has(s.id)}
                      disabled={s.id === "S00"}
                      onChange={(e) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(s.id);
                          else next.delete(s.id);
                          return next;
                        })
                      }
                    />
                    <span className="min-w-0">
                      <span className="font-mono text-th-text-muted">
                        {s.id}
                      </span>{" "}
                      {s.name}
                      {s.build === "code" && (
                        <span className="ml-1 text-th-text-muted">· code</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-th-text-muted">
              Cost cap (USD)
              <input
                type="number"
                name="rank-signal-cap"
                min={0.05}
                max={config?.maxRunUsd ?? DEFAULT_CAP_USD}
                step={0.05}
                value={capUsd}
                disabled={running}
                onChange={(e) =>
                  setCapUsd(
                    Math.max(
                      0,
                      Math.min(
                        config?.maxRunUsd ?? DEFAULT_CAP_USD,
                        Number(e.target.value) || 0,
                      ),
                    ),
                  )
                }
                className="bd-input w-full rounded-lg p-2 text-sm normal-case tracking-normal sm:w-28"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-[10px] uppercase tracking-wider text-th-text-muted">
              Judge model
              <select
                name="rank-signal-judge"
                value={judgeModel}
                disabled={running || !config}
                onChange={(e) => setJudgeModel(e.target.value)}
                className="bd-input w-full min-w-0 rounded-lg p-2 text-sm normal-case tracking-normal sm:w-64"
              >
                {(config?.allowedModels ?? []).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            {running ? (
              <button
                onClick={stop}
                className="rounded-lg border border-th-border bg-th-card-alt px-5 py-2 text-sm font-medium text-th-text hover:bg-th-card-hover"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={run}
                disabled={!canRun}
                className="bd-btn-primary rounded-lg px-5 py-2 text-sm disabled:opacity-50"
              >
                Run
              </button>
            )}
          </div>
        </div>
      )}
      {demoMode && (
        <div className="mt-3">
          <button
            disabled
            className="bd-btn-primary rounded-lg px-5 py-2 text-sm disabled:opacity-50"
          >
            Run
          </button>
        </div>
      )}

      {/* Progress */}
      {running && live && (
        <div className="mt-3 text-xs tabular-nums text-th-text-secondary">
          Running {live.signalId} · n {live.n} / {live.maxN || "…"} · $
          {live.spent.toFixed(2)} of ${capUsd.toFixed(2)} cap · pool{" "}
          {live.poolSize || "…"}
          {live.fromSerp > 0 && ` (${live.fromSerp} from SERP top 10)`}
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-lg border border-th-danger/30 bg-th-danger-soft px-3 py-2 text-xs text-th-danger">
          {error}
        </div>
      )}
      {notice && (
        <p className="mt-3 text-xs text-th-text-secondary">{notice}</p>
      )}

      {/* View toggle */}
      {!demoMode && results.length > 0 && (
        <div className="mt-4 inline-flex rounded-lg border border-th-border p-0.5 text-xs">
          {(
            [
              ["run", "This run"],
              ["all", "All runs"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`rounded-md px-3 py-1 ${
                view === v
                  ? "bg-th-card-alt font-medium text-th-text"
                  : "text-th-text-muted hover:text-th-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {pooled && rows.length > 0 && (
        <p className="mt-2 text-xs text-th-text-muted">
          Pooled, descriptive: trials from every stored run, deduped by passage.
          No stop decisions.
        </p>
      )}

      {/* Table */}
      {rows.length > 0 && (
        <div className="mt-3" role="table" aria-label="Rank Signal results">
          <div
            role="row"
            className="hidden border-b border-th-border pb-1.5 text-[10px] uppercase tracking-wider text-th-text-muted sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_5.5rem_4rem_minmax(0,2.6fr)] sm:gap-x-4"
          >
            <span role="columnheader">Signal</span>
            <span role="columnheader">Verdict</span>
            <span role="columnheader">n / Wins</span>
            <span role="columnheader">Mean</span>
            <span role="columnheader">95% CI</span>
          </div>
          {rows.map((row) => {
            const p = posterior(row.wins, row.n);
            const label = verdictLabel(row, pooled);
            const rowExamples = demoMode
              ? []
              : (examples.examples[row.id] ?? []);
            const open = openRow === row.key;
            return (
              <div
                key={row.key}
                role="row"
                className="grid grid-cols-1 gap-x-4 gap-y-1.5 border-b border-th-border py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_5.5rem_4rem_minmax(0,2.6fr)] sm:items-center"
              >
                <div role="cell" className="min-w-0 text-sm text-th-text">
                  <span className="font-mono text-xs text-th-text-muted">
                    {row.id}
                  </span>
                  {row.name && <span className="ml-1.5">{row.name}</span>}
                  {row.build === "code" && (
                    <span className="ml-1.5 text-xs text-th-text-muted">
                      code
                    </span>
                  )}
                  {withinEditBias(row) && (
                    <div className="text-xs text-th-text-muted">
                      within edit-bias range
                    </div>
                  )}
                  {row.meta && (
                    <div className="text-xs break-words text-th-text-muted">
                      {row.meta}
                    </div>
                  )}
                  {rowExamples.length > 0 && (
                    <button
                      onClick={() => setOpenRow(open ? null : row.key)}
                      aria-expanded={open}
                      className="mt-0.5 block text-xs text-th-text-accent hover:underline"
                    >
                      {open ? "Hide example pairs" : "Example pairs"}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:contents">
                  <div role="cell">
                    <VerdictCell row={row} pooled={pooled} />
                  </div>
                  <div
                    role="cell"
                    className="text-sm tabular-nums text-th-text-secondary"
                  >
                    <span className="text-th-text-muted sm:hidden">
                      n / wins{" "}
                    </span>
                    {row.n} / {row.wins}
                  </div>
                  <div
                    role="cell"
                    className="text-sm tabular-nums text-th-text-secondary"
                  >
                    <span className="text-th-text-muted sm:hidden">mean </span>
                    {pct(p.mean)}%
                  </div>
                </div>
                <div role="cell" className="min-w-0">
                  <CiBar wins={row.wins} n={row.n} tone={label.tone} />
                </div>
                {open && (
                  <div className="space-y-2 sm:col-span-full">
                    {rowExamples.map((ex, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-th-border bg-th-card-alt p-3 text-xs"
                      >
                        <div className="mb-1.5 text-th-text-muted">
                          synthetic test edit · {ex.direction}
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          {(
                            [
                              ["with", ex.with],
                              ["without", ex.without],
                            ] as const
                          ).map(([side, text]) => (
                            <div key={side} className="min-w-0">
                              <div className="mb-0.5 font-medium text-th-text">
                                {side}
                              </div>
                              <p className="whitespace-pre-wrap text-th-text-secondary [overflow-wrap:anywhere]">
                                {text}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* S00 calibration */}
      {placebo && placeboCi && (
        <p className="mt-3 text-xs leading-relaxed text-th-text-secondary">
          Calibration (S00 placebo): mean {pct(placeboCi.mean)}%, 95% CI [
          {pct(placeboCi.lo)}, {pct(placeboCi.hi)}]. Edit bias could be up to ±
          {editBiasPp.toFixed(1)} pp.
        </p>
      )}

      {/* Run metadata */}
      {!demoMode && !pooled && thisRun.length > 0 && (
        <p className="mt-2 text-xs break-words text-th-text-muted">
          judge {thisRun[0].judgeModel} (reasoning {thisRun[0].reasoningEffort})
          · rewriter {thisRun[0].rewriteModel} · catalog v
          {thisRun[0].catalogVersion} · spent ${runSpent.toFixed(2)}
        </p>
      )}

      {/* Diagnostics */}
      {!demoMode && diagRows.length > 0 && (
        <details className="mt-3 text-xs text-th-text-secondary">
          <summary className="cursor-pointer text-th-text">Diagnostics</summary>
          <div className="mt-2 space-y-1">
            <div className="tabular-nums">
              Position bias: judge picked A in {pct(overallA)}% of{" "}
              {allValid.length} valid calls
              {positionWarning && (
                <span className="text-th-danger"> (outside 35-65%)</span>
              )}
            </div>
            {diagRows.map((r) => {
              const attempts = r.trials.length + r.rejectedPairs + r.skipped;
              const invalid = r.trials.filter(
                (t) => t.outcome === "invalid",
              ).length;
              const valid = r.trials.filter((t) => t.outcome !== "invalid");
              const a = valid.filter(choseA).length;
              const add = r.trials.filter((t) => t.direction === "add").length;
              const rejRate = attempts ? r.rejectedPairs / attempts : 0;
              const invRate = r.trials.length ? invalid / r.trials.length : 0;
              return (
                <div key={r.key} className="break-words tabular-nums">
                  <span className="font-mono text-th-text-muted">{r.id}</span>{" "}
                  rejected {pct(rejRate)}% · skipped{" "}
                  {pct(attempts ? r.skipped / attempts : 0)}% · invalid{" "}
                  {pct(invRate)}% · picked A{" "}
                  {valid.length ? pct(a / valid.length) : "0.0"}% · add/remove{" "}
                  {add}/{r.trials.length - add}
                  {rejRate > 0.4 && (
                    <span className="text-th-danger"> · over 40% rejected</span>
                  )}
                  {invRate > 0.15 && (
                    <span className="text-th-danger"> · judge unreliable</span>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
