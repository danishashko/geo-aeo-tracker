import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedModels,
  estimateCallUsd,
  modelProblem,
  parseChoice,
} from "./rank-signal-judge";

test("parseChoice: valid answers", () => {
  assert.equal(parseChoice('{"choice":"B"}'), "B");
  assert.equal(parseChoice(' {"choice": "A"} '), "A");
  assert.equal(parseChoice('```json\n{"choice":"A"}\n```'), "A");
  assert.equal(parseChoice("A"), "A");
  assert.equal(parseChoice("**B**"), "B");
  assert.equal(parseChoice("B."), "B");
});

test("parseChoice: invalid answers", () => {
  assert.equal(parseChoice("Both"), null);
  assert.equal(parseChoice(""), null);
  assert.equal(parseChoice(null), null);
  assert.equal(parseChoice("Neither passage answers the query."), null);
  assert.equal(parseChoice('{"choice":"both"}'), null);
  assert.equal(parseChoice("I cannot choose."), null);
});

test("allowlist defaults to the two default models, all priced", () => {
  const prev = process.env.RANK_SIGNAL_ALLOWED_MODELS;
  delete process.env.RANK_SIGNAL_ALLOWED_MODELS;
  try {
    assert.deepEqual(allowedModels(), [
      "google/gemini-3.6-flash",
      "google/gemini-3.5-flash",
    ]);
    assert.equal(modelProblem("google/gemini-3.6-flash"), null);
    assert.match(modelProblem("openai/gpt-x") ?? "", /not allowed/);
    process.env.RANK_SIGNAL_ALLOWED_MODELS =
      "google/gemini-3.6-flash,acme/unpriced";
    assert.match(modelProblem("acme/unpriced") ?? "", /no price entry/);
    assert.match(modelProblem("google/gemini-3.5-flash") ?? "", /not allowed/);
  } finally {
    if (prev === undefined) delete process.env.RANK_SIGNAL_ALLOWED_MODELS;
    else process.env.RANK_SIGNAL_ALLOWED_MODELS = prev;
  }
});

test("price table matches §7 per-call figures", () => {
  // Judge ~700 in / 300 out on 3.6 Flash ≤ $0.0017
  assert.ok(estimateCallUsd("google/gemini-3.6-flash", 700, 300) <= 0.0017);
  // Rewriter ~600 in / 500 out on 3.5 Flash ≈ $0.0054
  assert.ok(
    Math.abs(estimateCallUsd("google/gemini-3.5-flash", 600, 500) - 0.0054) <
      0.0001,
  );
});
