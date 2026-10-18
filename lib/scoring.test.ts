import test from "node:test";
import assert from "node:assert/strict";
import {
  calcVisibilityScore,
  countMentions,
  detectSentiment,
  findMentions,
} from "./scoring";

test("brand does not match inside another word", () => {
  assert.deepEqual(findMentions("Try a search engine", ["Arc"]), []);
  assert.deepEqual(findMentions("We like Arc a lot", ["Arc"]), ["Arc"]);
  assert.equal(calcVisibilityScore("Try a search engine", [], ["Arc"], []), 0);
});

test("handles spaces, dots, ampersands and unicode", () => {
  assert.equal(countMentions("Use Acme  Corp today", ["Acme Corp"]), 1);
  assert.equal(
    countMentions("See example.com and exampleXcom", ["example.com"]),
    1,
  );
  assert.equal(countMentions("AT&T and AT&Tx", ["AT&T"]), 1);
  assert.equal(countMentions("Café Münch is open", ["Café Münch"]), 1);
  assert.equal(countMentions("Cafés", ["Café"]), 0);
});

test("overlapping aliases count the longest match once", () => {
  assert.equal(countMentions("Acme Inc is great", ["Acme", "Acme Inc"]), 1);
  assert.equal(
    countMentions("Acme Inc and Acme again", ["Acme", "Acme Inc"]),
    2,
  );
  // one mention should not earn the multiple-mention bonus
  const one = calcVisibilityScore(
    "Acme Inc ships it.",
    [],
    ["Acme", "Acme Inc"],
    [],
  );
  assert.equal(one, 30 + 20 + 5);
});

test("sentiment words match whole words only", () => {
  const neutral = "Acme has a badge and a stop sign, nothing else.";
  assert.equal(detectSentiment(neutral, ["Acme"]), "neutral");
  const pos = "Acme is the best, a top and trusted pick, great and reliable.";
  assert.equal(detectSentiment(pos, ["Acme"]), "positive");
  const neg = "Acme is poor, bad, weak and risky. Avoid.";
  assert.equal(detectSentiment(neg, ["Acme"]), "negative");
  assert.equal(detectSentiment("Nothing here", ["Acme"]), "not-mentioned");
});

test("scoring weights are unchanged", () => {
  const answer = "Acme is mentioned. Acme again. Acme third.";
  const score = calcVisibilityScore(
    answer,
    ["https://acme.com/page"],
    ["Acme"],
    ["https://acme.com"],
  );
  // 30 mention + 20 early + 15 multiple + 20 website + 5 neutral
  assert.equal(score, 90);
  assert.equal(calcVisibilityScore("x", [], [], []), 0);
});
