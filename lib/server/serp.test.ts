import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchSerp, parseOrganic, resultDomain } from "./serp";

// Shapes of a live Bright Data SERP response (Nov 2026); sites are placeholders.
const GOTO = "https://www.google.com/goto?url=CAESeAHEIkXXPRR2Med";
const RAW = [
  {
    link: GOTO,
    display_link: "https://www.globex.com",
    title: "Globex",
    rank: 1,
  },
  {
    link: GOTO,
    display_link: "50+ comments · 3 years ago",
    source: "Reddit · r/smallbusiness",
    title: "Reddit",
    rank: 2,
  },
  {
    link: GOTO,
    display_link: "https://acme.com › Blog › Guides",
    title: "Acme",
    rank: 3,
  },
  { link: "https://www.initech.com/store", title: "Initech", rank: 4 },
];

test("resultDomain reads the site behind a google.com/goto link", () => {
  assert.equal(resultDomain(RAW[0]), "globex.com");
  assert.equal(resultDomain(RAW[2]), "acme.com");
  assert.equal(resultDomain(RAW[3]), "initech.com");
  assert.equal(resultDomain(RAW[1]), ""); // Google shows no site, so none is guessed
  assert.equal(resultDomain({ link: "https://www.google.com/url?q=x" }), "");
});

test("parseOrganic finds the target behind a redirect link", () => {
  const r = parseOrganic(RAW, "acme.com");
  assert.equal(r.targetRank, 3);
  assert.deepEqual(
    r.organicResults.map((o) => o.domain),
    ["globex.com", "", "acme.com", "initech.com"],
  );
  assert.equal(r.organicResults[2].isTarget, true);
  // An empty target never matches a result with no visible domain.
  assert.equal(parseOrganic(RAW, "").targetRank, null);
});

function stubFetch(bodies: string[]) {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    const body = bodies[Math.min(calls, bodies.length - 1)];
    calls += 1;
    return new Response(JSON.stringify({ status_code: 200, body }), {
      status: 200,
    });
  }) as typeof fetch;
  return { calls: () => calls, restore: () => (globalThis.fetch = real) };
}

test("fetchSerp retries once after a non-JSON body (Bright Data's 15s cooldown)", async (t) => {
  const prev = process.env.BRIGHT_DATA_KEY;
  process.env.BRIGHT_DATA_KEY = "k";
  t.mock.method(console, "error", () => {});
  const ok = JSON.stringify({ organic: RAW });
  const s = stubFetch([
    "This query recently failed and cannot be attempted at this time. Please try again later, after a minimum of 15 seconds.",
    ok,
  ]);
  try {
    const r = await fetchSerp("best crm", "https://acme.com", {
      retryDelayMs: 1,
    });
    assert.equal(s.calls(), 2);
    assert.equal(r.totalResults, 4);
    assert.equal(r.targetRank, 3);
  } finally {
    s.restore();
    process.env.BRIGHT_DATA_KEY = prev;
  }
});

test("fetchSerp gives up after one retry and returns no results", async (t) => {
  const prev = process.env.BRIGHT_DATA_KEY;
  process.env.BRIGHT_DATA_KEY = "k";
  t.mock.method(console, "error", () => {});
  const s = stubFetch([""]);
  try {
    const r = await fetchSerp("x", "", { retryDelayMs: 1 });
    assert.equal(s.calls(), 2);
    assert.equal(r.totalResults, 0);
  } finally {
    s.restore();
    process.env.BRIGHT_DATA_KEY = prev;
  }
});
