import { test } from "node:test";
import assert from "node:assert/strict";
import { stripMarkdown } from "./strip-markdown";

test("strips bold and italic markers", () => {
  assert.equal(stripMarkdown("**1. Forkful** — a __great__ pick, *really*"), "1. Forkful — a great pick, really");
});

test("strips headings, list markers and quotes", () => {
  assert.equal(
    stripMarkdown("## Top picks\n- one\n* two\n+ three\n> note"),
    "Top picks\none\ntwo\nthree\nnote",
  );
});

test("keeps numbered lists and plain asterisks in math", () => {
  assert.equal(stripMarkdown("1. first\n2. second"), "1. first\n2. second");
  assert.equal(stripMarkdown("2 * 3 * 4"), "2 * 3 * 4");
});

test("keeps snake_case and link text, drops urls", () => {
  assert.equal(stripMarkdown("use my_var_name"), "use my_var_name");
  assert.equal(stripMarkdown("see [the docs](https://x.dev/a) now"), "see the docs now");
});

test("drops code ticks and rules, collapses blank lines", () => {
  assert.equal(stripMarkdown("run `npm test`\n\n---\n\n\n\ndone"), "run npm test\n\ndone");
});
