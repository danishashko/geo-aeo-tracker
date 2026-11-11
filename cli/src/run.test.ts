import { test } from "node:test";
import assert from "node:assert/strict";
import { run, EXIT, type CliDeps } from "./run";
import type { SerpResult } from "../../lib/server/sro-types";
import type { AuditReport } from "../../lib/server/audit";

const ANSWER =
  "The best scraping APIs are Acme and Rival. Acme is great and reliable for agents.";

function harness(over: Partial<CliDeps> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const calls = { scrape: [] as string[], serp: 0, audit: [] as string[] };
  const deps: CliDeps = {
    scrape: async ({ provider }) => {
      calls.scrape.push(provider);
      return {
        answer: ANSWER,
        sources: ["https://acme.com/docs", "https://other.com"],
        cached: false,
      };
    },
    serp: async (keyword) => {
      calls.serp += 1;
      return {
        keyword,
        totalResults: 2,
        organicResults: [
          {
            position: 1,
            url: "https://a.com",
            domain: "a.com",
            title: "A",
            description: "",
            isTarget: false,
          },
          {
            position: 2,
            url: "https://acme.com",
            domain: "acme.com",
            title: "Acme",
            description: "",
            isTarget: true,
          },
        ],
        targetRank: 2,
        topCompetitors: [],
      } satisfies SerpResult;
    },
    audit: async (url) => {
      calls.audit.push(url);
      return {
        url,
        score: 40,
        checks: [
          {
            id: "x",
            label: "X",
            category: "content",
            pass: false,
            value: "Missing",
            detail: "Add X.",
          },
        ],
        llmsTxtPresent: false,
        schemaMentions: 0,
        blufDensity: 0,
        pass: { llmsTxt: false, schema: false, bluf: false },
      } as AuditReport;
    },
    datasetId: (p) => `ds_${p}`,
    env: { BRIGHT_DATA_KEY: "k" },
    out: (t) => out.push(t),
    err: (t) => err.push(t),
    ...over,
  };
  return { deps, out, err, calls, text: () => out.join("\n") };
}

test("cli: engines --json lists the 4 engines and retired ones", async () => {
  const h = harness();
  assert.equal(await run(["engines", "--json"], h.deps), EXIT.ok);
  const data = JSON.parse(h.text());
  assert.deepEqual(
    data.engines.map((e: { id: string }) => e.id),
    ["chatgpt", "perplexity", "gemini", "google_ai"],
  );
  assert.deepEqual(
    data.retired.map((r: { id: string }) => r.id),
    ["copilot", "grok"],
  );
});

test("cli: check scores every engine and prints a summary", async () => {
  const h = harness();
  const code = await run(
    [
      "check",
      "best",
      "scraping",
      "api",
      "--brand",
      "Acme",
      "--competitor",
      "Rival,Globex",
      "--website",
      "acme.com",
    ],
    h.deps,
  );
  assert.equal(code, EXIT.ok);
  assert.deepEqual(h.calls.scrape.sort(), [
    "chatgpt",
    "gemini",
    "google_ai",
    "perplexity",
  ]);
  assert.match(h.text(), /"best scraping api"/);
  assert.match(
    h.text(),
    /mentioned, positive, site cited, 2 sources, competitors: Rival/,
  );
  assert.match(
    h.text(),
    /Average visibility: \d+ {2}\(4 of 4 engines answered\)/,
  );
  assert.equal(h.err.length, 4); // one progress line per engine, on stderr
});

test("cli: check --json returns full answers and parses", async () => {
  const h = harness();
  await run(
    ["check", "best api", "--brand", "Acme", "--engine", "gemini", "--json"],
    h.deps,
  );
  const report = JSON.parse(h.text());
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].answer, ANSWER);
  assert.equal(report.summary.country, "US");
});

test("cli: --min-score exits 3 when visibility is below it", async () => {
  const h = harness();
  const code = await run(
    ["check", "best api", "--brand", "Acme", "--min-score", "100"],
    h.deps,
  );
  assert.equal(code, EXIT.belowMin);
  assert.match(h.err.join("\n"), /below --min-score 100/);
});

test("cli: check exits 1 when no engine answers", async () => {
  const h = harness({
    scrape: async () => {
      throw new Error("upstream down");
    },
  });
  assert.equal(
    await run(["check", "best api", "--brand", "Acme"], h.deps),
    EXIT.failed,
  );
  assert.match(h.text(), /ERROR {2}upstream down/);
});

test("cli: bad input exits 2 before any paid call", async () => {
  for (const args of [
    ["check", "best api"],
    ["check", "hi", "--brand", "Acme"],
    ["check", "best api", "--brand", "Acme", "--engine", "copilot"],
    ["check", "best api", "--brand", "Acme", "--country", "USA"],
    ["check", "best api", "--brand", "Acme", "--timeout", "1"],
    ["check", "best api", "--brand", "Acme", "--bogus"],
    ["serp"],
    ["audit"],
    ["nope"],
  ]) {
    const h = harness();
    assert.equal(await run(args, h.deps), EXIT.usage, args.join(" "));
    assert.equal(h.calls.scrape.length + h.calls.serp, 0, args.join(" "));
  }
});

test("cli: check and serp need BRIGHT_DATA_KEY", async () => {
  for (const args of [
    ["check", "best api", "--brand", "Acme"],
    ["serp", "best api"],
  ]) {
    const h = harness({ env: {} });
    assert.equal(await run(args, h.deps), EXIT.usage);
    assert.match(h.err.join("\n"), /BRIGHT_DATA_KEY is not set/);
    assert.equal(h.calls.scrape.length + h.calls.serp, 0);
  }
});

test("cli: audit adds https, prints failed checks, honours --min-score", async () => {
  const h = harness({ env: {} }); // audit needs no key
  assert.equal(await run(["audit", "example.com"], h.deps), EXIT.ok);
  assert.deepEqual(h.calls.audit, ["https://example.com"]);
  assert.match(h.text(), /score 40\/100/);
  assert.match(h.text(), /FAIL {2}X +Missing\n {6}Add X\./);
  assert.equal(
    await run(
      ["audit", "https://example.com", "--min-score", "50"],
      harness().deps,
    ),
    EXIT.belowMin,
  );
});

test("cli: audit errors exit 1", async () => {
  const h = harness({
    audit: async () => {
      throw new Error("URL points to a private or reserved address.");
    },
  });
  assert.equal(
    await run(["audit", "http://169.254.169.254/"], h.deps),
    EXIT.failed,
  );
  assert.match(h.err.join("\n"), /private or reserved/);
});

test("cli: serp prints results and the target rank", async () => {
  const h = harness();
  assert.equal(
    await run(
      ["serp", "best", "api", "--target", "acme.com", "--limit", "1"],
      h.deps,
    ),
    EXIT.ok,
  );
  assert.equal(h.calls.serp, 1);
  assert.match(h.text(), /^1 +A\n {4}https:\/\/a\.com/);
  assert.doesNotMatch(h.text(), /https:\/\/acme\.com\n/);
  assert.match(h.text(), /acme\.com: rank 2/);
});

test("cli: serp with no results exits 1", async () => {
  const h = harness({
    serp: async (k) => ({
      keyword: k,
      totalResults: 0,
      organicResults: [],
      targetRank: null,
      topCompetitors: [],
    }),
  });
  assert.equal(await run(["serp", "best api"], h.deps), EXIT.failed);
  assert.match(h.err.join("\n"), /no organic results/);
});

test("cli: --version and --help exit 0", async () => {
  const v = harness();
  assert.equal(await run(["--version"], v.deps), EXIT.ok);
  assert.equal(v.text(), "0.0.0-dev");
  const help = harness();
  assert.equal(await run(["--help"], help.deps), EXIT.ok);
  assert.match(help.text(), /Exit codes/);
});

test("cli: flags that do not apply to a command exit 2 before any call", async () => {
  for (const args of [
    ["serp", "best crm", "--country", "US"],
    ["audit", "example.com", "--brand", "Acme"],
    ["engines", "--limit", "3"],
    ["check", "best api", "--brand", "Acme", "--target", "acme.com"],
  ]) {
    const h = harness();
    assert.equal(await run(args, h.deps), EXIT.usage, args.join(" "));
    assert.match(h.err.join("\n"), /does not apply to/);
    assert.equal(
      h.calls.scrape.length + h.calls.serp + h.calls.audit.length,
      0,
    );
  }
});

test("cli: bad or non-http audit URLs exit 2 without fetching", async () => {
  for (const url of ["not a url", "ftp://example.com", "file:///etc/passwd"]) {
    const h = harness();
    assert.equal(await run(["audit", url], h.deps), EXIT.usage, url);
    assert.equal(h.calls.audit.length, 0, url);
  }
});

test("cli: `help` prints help; engines rejects extra arguments", async () => {
  const h = harness();
  assert.equal(await run(["help"], h.deps), EXIT.ok);
  assert.match(h.text(), /Exit codes/);
  assert.equal(await run(["engines", "extra"], harness().deps), EXIT.usage);
});
