import { test } from "node:test";
import assert from "node:assert/strict";
import { checkBluf } from "./bluf";

const filler = "This page describes our company and its long history. ".repeat(
  20,
);
const list = "<ul>" + "<li>a</li>".repeat(5) + "</ul>";

test("BLUF: long opening text with lists but no direct answer fails", () => {
  const r = checkBluf(filler, `<p>${filler}</p>${list}`);
  assert.equal(r.pass, false);
  assert.equal(r.directAnswer, null);
  assert.equal(r.density, 1); // density can be high while the check still fails
});

test("BLUF: plain long text alone does not pass (the old 50% pass)", () => {
  const r = checkBluf(filler, `<p>${filler}</p>`);
  assert.equal(r.pass, false);
  assert.equal(r.density, 0.5);
});

test("BLUF: a direct-answer phrase in the opening passes and is reported", () => {
  const text = `In short, the best option is X. ${filler}`;
  const r = checkBluf(text, `<p>${text}</p>`);
  assert.equal(r.pass, true);
  assert.equal(r.directAnswer, "In short");
});

test("BLUF: a direct-answer phrase buried past the opening does not count", () => {
  const text = `${filler.repeat(5)} The bottom line is X.`;
  const r = checkBluf(text, `<p>${text}</p>`);
  assert.equal(r.pass, false);
});
