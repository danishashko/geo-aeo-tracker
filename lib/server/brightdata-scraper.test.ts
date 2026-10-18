import { test } from "node:test";
import assert from "node:assert/strict";
import { runAiScraper } from "./brightdata-scraper";

function mockFetch(body: unknown) {
  const original = globalThis.fetch;
  const state = { calls: 0 };
  globalThis.fetch = (async () => {
    state.calls++;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { state, restore: () => (globalThis.fetch = original) };
}

test("an error record is never turned into an answer, and is not cached", async () => {
  const prevKey = process.env.BRIGHT_DATA_KEY;
  process.env.BRIGHT_DATA_KEY = "test-key";
  const prompt = "best crm for small agencies in 2026";
  const mock = mockFetch([
    {
      input: { url: "https://chatgpt.com/", prompt, index: 1 },
      error: "Request timed out while waiting for the answer",
      error_code: "timeout",
    },
  ]);
  try {
    const request = { provider: "chatgpt" as const, prompt };
    await assert.rejects(runAiScraper(request), /error record.*timeout/);
    await assert.rejects(runAiScraper(request), /error record/);
    assert.equal(mock.state.calls, 2, "failed results are not cached");
  } finally {
    mock.restore();
    if (prevKey === undefined) delete process.env.BRIGHT_DATA_KEY;
    else process.env.BRIGHT_DATA_KEY = prevKey;
  }
});

test("a record with no answer field throws instead of echoing the input", async () => {
  const prevKey = process.env.BRIGHT_DATA_KEY;
  process.env.BRIGHT_DATA_KEY = "test-key";
  const prompt = "which analytics tool has the best dashboards";
  const mock = mockFetch([
    { input: { url: "https://gemini.google.com/", prompt, index: 1 }, url: "https://gemini.google.com/" },
  ]);
  try {
    await assert.rejects(
      runAiScraper({ provider: "gemini", prompt }),
      /no answer field/,
    );
  } finally {
    mock.restore();
    if (prevKey === undefined) delete process.env.BRIGHT_DATA_KEY;
    else process.env.BRIGHT_DATA_KEY = prevKey;
  }
});

test("a record with answer_text still resolves", async () => {
  const prevKey = process.env.BRIGHT_DATA_KEY;
  process.env.BRIGHT_DATA_KEY = "test-key";
  const mock = mockFetch([
    { input: { prompt: "ok prompt here" }, answer_text: "Acme is a solid pick." },
  ]);
  try {
    const out = await runAiScraper({ provider: "perplexity", prompt: "ok prompt here two" });
    assert.equal(out.answer, "Acme is a solid pick.");
  } finally {
    mock.restore();
    if (prevKey === undefined) delete process.env.BRIGHT_DATA_KEY;
    else process.env.BRIGHT_DATA_KEY = prevKey;
  }
});
