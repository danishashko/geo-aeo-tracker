import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  hourlySpentUsd,
  resetSpendLedger,
  runSignal,
  type RunSignalOptions,
} from "./rank-signal";
import { hashPassage, type Passage } from "./rank-signal-passages";
import { JUDGE_SYSTEM } from "./rank-signal-judge";
import type { RankSignalResult } from "./sro-types";

// ─── Fixtures ────────────────────────────────────────────────────────────

const WORDS =
  "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu".split(
    " ",
  );

function passage(i: number): Passage {
  const tag = `${WORDS[i % 26]} ${WORDS[(i * 7) % 26]} ${WORDS[(i * 11) % 26]}`;
  const text = [
    `The ${tag} meal kit ships chef-designed recipes to busy families every week.`,
    "Each box includes pre-portioned ingredients and simple recipe cards for quick dinners.",
    "Customers choose dishes from a rotating menu and can pause deliveries whenever they travel.",
    "Plans cover vegetarian, family and low-carb options with flexible delivery windows.",
  ].join(" ");
  return {
    text,
    heading: "",
    origin: i % 3 === 0 ? "target" : "competitor",
    domain: "example.com",
    hash: hashPassage(text),
    score: 1,
  };
}

const POOL = Array.from({ length: 45 }, (_, i) => passage(i));

function opts(over: Partial<RunSignalOptions> = {}): RunSignalOptions {
  return {
    runId: "run-1",
    signalId: "S06",
    keyword: "meal kit",
    targetUrl: "https://example.com/",
    passages: POOL,
    concurrency: 4,
    budgetUsd: 5,
    judgeModel: "google/gemini-3.6-flash",
    rewriteModel: "google/gemini-3.5-flash",
    now: new Date(2026, 8, 25),
    retryDelaysMs: [0, 0, 0],
    ...over,
  };
}

// ─── Fetch mock ──────────────────────────────────────────────────────────

type Judge = (a: string, b: string) => string;
let calls = 0;
let judgeCalls = 0;
let judge: Judge = () => '{"choice":"A"}';
let callCost = 0.001;
let delayMs = 0;
let failAll = false;
const realFetch = globalThis.fetch;

function reply(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { cost: callCost, prompt_tokens: 700, completion_tokens: 50 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

beforeEach(() => {
  calls = 0;
  judgeCalls = 0;
  callCost = 0.001;
  delayMs = 0;
  failAll = false;
  judge = () => '{"choice":"A"}';
  resetSpendLedger();
  process.env.OPENROUTER_KEY = "test-key";
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    calls++;
    const signal = init?.signal;
    if (delayMs) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, delayMs);
        signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      });
    }
    if (signal?.aborted)
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    if (failAll) return new Response("upstream down", { status: 503 });
    const body = JSON.parse(String(init?.body));
    const [system, user] = body.messages.map(
      (m: { content: string }) => m.content,
    );
    if (system === JUDGE_SYSTEM) {
      judgeCalls++;
      const a = user.split("[Passage A]\n")[1].split("\n\n[Passage B]")[0];
      const b = user.split("[Passage B]\n")[1];
      return reply(judge(a, b));
    }
    // Rewriter: add a number (S02) to the passage
    const text = user.split('"""\n')[1].split('\n"""')[0];
    return reply(
      JSON.stringify({
        with: text.replace("every week", "every 7 days"),
        without: text,
      }),
    );
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function collect() {
  const events: { type: string; data: Record<string, unknown> }[] = [];
  const emit = (type: string, data: unknown) =>
    events.push({ type, data: data as Record<string, unknown> });
  return { events, emit };
}

const validN = (r: RankSignalResult) =>
  r.trials.filter((t) => t.outcome !== "invalid").length;

// ─── Runner cases (spec §11 step 3) ─────────────────────────────────────

test("always-win stops positive at exactly n = 20", async () => {
  judge = (a) => (a.startsWith("As of") ? '{"choice":"A"}' : '{"choice":"B"}');
  const { events, emit } = collect();
  const r = (await runSignal(opts(), emit, new AbortController().signal))!;
  assert.equal(r.endReason, "verdict");
  assert.equal(validN(r), 20);
  assert.ok(
    r.trials.every((t) => t.outcome === "win" && t.direction === "add"),
  );
  const cps = events.filter((e) => e.type === "checkpoint");
  assert.equal(cps.length, 1);
  assert.deepEqual(cps[0].data, { n: 20, wins: 20, verdict: "positive" });
  assert.equal(events[0].type, "start");
  assert.equal(events.at(-1)!.type, "signal_done");
  assert.equal(judgeCalls, 20, "code-built: one judge call per trial");
});

test("p = 0.5 never stops before 40; A/B split stays within concurrency", async () => {
  // A position-biased judge: always "A" → the feature wins only when it is on A.
  judge = () => '{"choice":"A"}';
  const { events, emit } = collect();
  const r = (await runSignal(opts(), emit, new AbortController().signal))!;
  assert.equal(validN(r), 40);
  assert.equal(r.endReason, "max_trials");
  const cps = events.filter((e) => e.type === "checkpoint");
  assert.deepEqual(
    cps.map((c) => c.data.n),
    [20, 30, 40],
  );
  assert.deepEqual(
    cps.map((c) => c.data.verdict),
    ["pending", "pending", "no_clear_effect"],
  );
  // Position balance at every checkpoint
  for (const cp of cps) {
    const upTo = r.trials.slice(0, cp.data.n as number);
    const onA = upTo.filter((t) => t.featureSide === "A").length;
    assert.ok(Math.abs(onA - (upTo.length - onA)) <= 4);
  }
});

test("$0.01 budget ends with endReason budget", async () => {
  callCost = 0.002;
  const { emit } = collect();
  const r = (await runSignal(
    opts({ budgetUsd: 0.01 }),
    emit,
    new AbortController().signal,
  ))!;
  assert.equal(r.endReason, "budget");
  assert.ok(r.costUsd <= 0.01 + 1e-9, `spent ${r.costUsd}`);
  assert.ok(validN(r) < 20);
});

test("abort after 5 trials → no further fetch calls", async () => {
  const ac = new AbortController();
  const { emit } = collect();
  const r = (await runSignal(
    opts({ concurrency: 1 }),
    (type, data) => {
      emit(type, data);
      if (type === "progress" && (data as { n: number }).n >= 5) ac.abort();
    },
    ac.signal,
  ))!;
  assert.equal(r.endReason, "aborted");
  assert.equal(validN(r), 5);
  const after = calls;
  await new Promise((res) => setTimeout(res, 50));
  assert.equal(calls, after);
  assert.equal(calls, 5);
});

test("abort mid-batch cancels in-flight calls", async () => {
  delayMs = 200;
  const ac = new AbortController();
  const { events, emit } = collect();
  setTimeout(() => ac.abort(), 30);
  const started = Date.now();
  const r = (await runSignal(opts(), emit, ac.signal))!;
  assert.ok(Date.now() - started < 150, "did not wait for in-flight calls");
  assert.equal(r.endReason, "aborted");
  assert.equal(r.trials.length, 0);
  assert.equal(events.filter((e) => e.type === "progress").length, 0);
  const after = calls;
  await new Promise((res) => setTimeout(res, 50));
  assert.equal(calls, after);
});

test("LLM-built signal: rewriter + judge per trial, both sides from the rewriter", async () => {
  judge = (a) => (/7 days/.test(a) ? '{"choice":"A"}' : '{"choice":"B"}');
  const { events, emit } = collect();
  const r = (await runSignal(
    opts({ signalId: "S02" }),
    emit,
    new AbortController().signal,
  ))!;
  assert.equal(r.endReason, "verdict");
  assert.equal(validN(r), 20);
  assert.equal(calls, 40);
  const done = events.find((e) => e.type === "signal_done")!;
  const examples = done.data.examples as { with: string }[];
  assert.equal(examples.length, 2);
  assert.match(examples[0].with, /7 days/);
});

test("unparsable judge answers are retried once, then invalid", async () => {
  judge = () => "Both are fine.";
  const { emit } = collect();
  const r = (await runSignal(
    opts({ passages: POOL.slice(0, 20) }),
    emit,
    new AbortController().signal,
  ))!;
  assert.equal(r.endReason, "pool_exhausted");
  assert.equal(r.trials.length, 20);
  assert.ok(r.trials.every((t) => t.outcome === "invalid"));
  assert.equal(judgeCalls, 40);
});

test("5 consecutive upstream failures end with endReason error", async () => {
  failAll = true;
  const { emit } = collect();
  const r = (await runSignal(opts(), emit, new AbortController().signal))!;
  assert.equal(r.endReason, "error");
  assert.ok(r.trials.every((t) => t.outcome === "invalid"));
});

test("pool under 20 is refused up front", async () => {
  const { events, emit } = collect();
  const r = await runSignal(
    opts({ passages: POOL.slice(0, 12) }),
    emit,
    new AbortController().signal,
  );
  assert.equal(r, null);
  assert.deepEqual(events, [
    {
      type: "error",
      data: { message: "page too short (12 passages; need 20)" },
    },
  ]);
  assert.equal(calls, 0);
});

test("spend is recorded in the hourly ledger", async () => {
  judge = (a) => (a.startsWith("As of") ? '{"choice":"A"}' : '{"choice":"B"}');
  await runSignal(opts(), () => {}, new AbortController().signal);
  assert.ok(Math.abs(hourlySpentUsd() - 20 * 0.001) < 1e-9);
});

// ─── Route: hourly cap → 429 on the next request ────────────────────────

test("route: the second request after the hourly cap → 429", async () => {
  const { POST } = await import("../../app/api/rank-signal/route");
  process.env.RANK_SIGNAL_MAX_USD_PER_HOUR = "0.01";
  callCost = 0.004;
  judge = (a) => (a.startsWith("As of") ? '{"choice":"A"}' : '{"choice":"B"}');
  // Three pages x 15 sections: pages keep their top 15, so the pool is 45.
  const page = (from: number) =>
    POOL.slice(from, from + 15)
      .map(
        (p, i) =>
          `## Part ${i}\n\n${p.text} Support answers questions about allergies, substitutions and billing within a day.`,
      )
      .join("\n\n");
  const body = JSON.stringify({
    targetUrl: "https://example.com/",
    keyword: "meal kit",
    signalId: "S06",
    targetPage: { url: "https://example.com/", fullText: page(0) },
    competitorPages: [
      { url: "https://b.example/", fullText: page(15) },
      { url: "https://c.example/", fullText: page(30) },
    ],
    budgetRemainingUsd: 5,
  });
  const mk = () =>
    new Request("http://localhost/api/rank-signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  try {
    const first = await POST(mk() as unknown as Parameters<typeof POST>[0]);
    assert.equal(first.status, 200);
    const text = await first.text();
    assert.match(text, /event: start/);
    assert.match(text, /"endReason":"budget"/);
    const second = await POST(mk() as unknown as Parameters<typeof POST>[0]);
    assert.equal(second.status, 429);
  } finally {
    delete process.env.RANK_SIGNAL_MAX_USD_PER_HOUR;
  }
});

test("route guards: bad body 400, disallowed model 400, demo-only 403", async () => {
  const { POST } = await import("../../app/api/rank-signal/route");
  const post = (payload: unknown) =>
    POST(
      new Request("http://localhost/api/rank-signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }) as unknown as Parameters<typeof POST>[0],
    );
  const good = {
    targetUrl: "https://example.com/",
    keyword: "meal kit",
    signalId: "S06",
    targetPage: { url: "https://example.com/", fullText: "" },
    budgetRemainingUsd: 1,
  };
  assert.equal((await post({ keyword: "x" })).status, 400);
  assert.equal(
    (await post({ ...good, judgeModel: "openai/gpt-x" })).status,
    400,
  );
  assert.equal((await post({ ...good, signalId: "S99" })).status, 400);
  process.env.NEXT_PUBLIC_DEMO_ONLY = "true";
  try {
    assert.equal((await post(good)).status, 403);
  } finally {
    delete process.env.NEXT_PUBLIC_DEMO_ONLY;
  }
});
