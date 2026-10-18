import { test } from "node:test";
import assert from "node:assert/strict";
import {
  betaQuantile,
  decide,
  posterior,
  verdict,
  type StatVerdict,
} from "./rank-signal-stats";

// scipy 1.16.3 beta.ppf vectors (spec §4), tolerance ±0.05 pp.
const VECTORS: [number, number, number, number, number, StatVerdict][] = [
  [6, 185, 0.0349, 0.01365, 0.06562, "negative"],
  [0, 35, 0.0139, 0.00001, 0.06878, "negative"],
  [190, 190, 0.9974, 0.98688, 1.0, "positive"],
  [131, 198, 0.6608, 0.59374, 0.7248, "positive"],
  [98, 191, 0.513, 0.44245, 0.58333, "no_clear_effect"],
  [15, 20, 0.7381, 0.53581, 0.8976, "positive"],
  [14, 20, 0.6905, 0.48277, 0.86388, "pending"],
  [26, 40, 0.6463, 0.49588, 0.78328, "no_clear_effect"],
];

test("§4 scipy vectors", () => {
  for (const [w, n, mean, lo, hi, v] of VECTORS) {
    const p = posterior(w, n);
    const label = `${w}/${n}`;
    assert.ok(Math.abs(p.mean - mean) <= 0.0005, `${label} mean ${p.mean}`);
    assert.ok(Math.abs(p.lo - lo) <= 0.0005, `${label} lo ${p.lo}`);
    assert.ok(Math.abs(p.hi - hi) <= 0.0005, `${label} hi ${p.hi}`);
    assert.equal(verdict(w, n), v, label);
  }
});

// DEJAN AI's published sample (dejan.ai/optimizer-sample), spec appendix.
const DEJAN = [
  { signal: "S01", n: 190, wins: 190, verdict: "positive", mean: 0.997, ci: [0.987, 1.0] },
  { signal: "S02", n: 195, wins: 191, verdict: "positive", mean: 0.977, ci: [0.952, 0.993] },
  { signal: "S03", n: 196, wins: 180, verdict: "positive", mean: 0.916, ci: [0.874, 0.951] },
  { signal: "S04", n: 191, wins: 174, verdict: "positive", mean: 0.909, ci: [0.864, 0.945] },
  { signal: "S05", n: 187, wins: 167, verdict: "positive", mean: 0.891, ci: [0.843, 0.931] },
  { signal: "S06", n: 198, wins: 166, verdict: "positive", mean: 0.837, ci: [0.782, 0.885] },
  { signal: "S07", n: 194, wins: 147, verdict: "positive", mean: 0.756, ci: [0.694, 0.814] },
  { signal: "S08", n: 154, wins: 116, verdict: "positive", mean: 0.752, ci: [0.681, 0.816] },
  { signal: "S09", n: 198, wins: 131, verdict: "positive", mean: 0.661, ci: [0.594, 0.725] },
  { signal: "S10", n: 191, wins: 98, verdict: "no_effect", mean: 0.513, ci: [0.442, 0.583] },
  { signal: "S11", n: 195, wins: 96, verdict: "no_effect", mean: 0.492, ci: [0.423, 0.562] },
  { signal: "S12", n: 194, wins: 93, verdict: "no_effect", mean: 0.479, ci: [0.41, 0.55] },
  { signal: "S13", n: 176, wins: 66, verdict: "negative", mean: 0.376, ci: [0.306, 0.448] },
  { signal: "S14", n: 195, wins: 67, verdict: "negative", mean: 0.344, ci: [0.28, 0.412] },
  { signal: "S15", n: 170, wins: 54, verdict: "negative", mean: 0.319, ci: [0.251, 0.39] },
  { signal: "S16", n: 197, wins: 62, verdict: "negative", mean: 0.316, ci: [0.253, 0.382] },
  { signal: "S17", n: 185, wins: 6, verdict: "negative", mean: 0.035, ci: [0.014, 0.066] },
];

const r3 = (x: number) => Math.round(x * 1000) / 1000;

test("reproduces all 17 published rows at 3 decimals", () => {
  for (const row of DEJAN) {
    const p = posterior(row.wins, row.n);
    assert.equal(r3(p.mean), row.mean, `${row.signal} mean`);
    assert.equal(r3(p.lo), row.ci[0], `${row.signal} lo`);
    assert.equal(r3(p.hi), row.ci[1], `${row.signal} hi`);
    const expected = row.verdict === "no_effect" ? "no_clear_effect" : row.verdict;
    assert.equal(verdict(row.wins, row.n), expected, `${row.signal} verdict`);
  }
});

test("n boundaries 19/20/39/40", () => {
  assert.equal(verdict(19, 19), "insufficient");
  assert.equal(verdict(0, 19), "insufficient");
  assert.equal(verdict(15, 20), "positive");
  assert.equal(verdict(14, 20), "pending");
  assert.equal(verdict(5, 20), "negative");
  assert.equal(verdict(20, 39), "pending");
  assert.equal(verdict(20, 40), "no_clear_effect");
  assert.equal(verdict(26, 40), "no_clear_effect");
});

test("lo exactly 0.5 is not positive; hi exactly 0.5 is not negative", () => {
  assert.equal(decide(20, 0.5, 0.9), "pending");
  assert.equal(decide(40, 0.5, 0.9), "no_clear_effect");
  assert.equal(decide(20, 0.1, 0.5), "pending");
  assert.equal(decide(20, 0.5000001, 0.9), "positive");
  assert.equal(decide(19, 0.9, 0.99), "insufficient");
});

test("edges: empty posterior, monotone quantile, bad input throws", () => {
  const p = posterior(0, 0);
  assert.equal(p.mean, 0.5);
  assert.ok(p.lo >= 0 && p.hi <= 1 && p.lo < p.hi);

  let prev = -1;
  for (let i = 0; i <= 100; i++) {
    const q = betaQuantile(i / 100, 3.5, 17.5);
    assert.ok(q >= prev, `monotone at ${i}`);
    prev = q;
  }
  assert.throws(() => posterior(5, 4));
  assert.throws(() => posterior(-1, 4));
  assert.throws(() => posterior(1, -4));
  assert.throws(() => posterior(1.5, 4));
  assert.throws(() => verdict(3, 2));
  assert.throws(() => betaQuantile(1.2, 1, 1));
});
