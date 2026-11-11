import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer, engineTimeoutFromEnv, type McpDeps } from "./mcp";
import { checkMcpAuth } from "./mcp-auth";
import type { SerpResult } from "./sro-types";

type Answers = Record<string, { answer: string; sources: string[] } | Error>;

function fakeDeps(answers: Answers, over: Partial<McpDeps> = {}) {
  const calls: Array<{ provider: string; prompt: string; country?: string }> =
    [];
  const deps: McpDeps = {
    scrape: async (req) => {
      calls.push(req);
      const a = answers[req.provider];
      if (!a) throw new Error(`no fake for ${req.provider}`);
      if (a instanceof Error) throw a;
      return { ...a, cached: false };
    },
    serp: async (keyword) => ({
      keyword,
      totalResults: 0,
      organicResults: [],
      targetRank: null,
      topCompetitors: [],
    }),
    audit: async (url) => ({ url, score: 80, checks: [] }),
    datasetId: (p) => `gd_${p}`,
    ...over,
  };
  return { deps, calls };
}

async function connect(deps: McpDeps) {
  const server = createMcpServer(deps);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientT);
  return client;
}

function body(res: unknown) {
  const r = res as {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
  const text = r.content[0].text;
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* plain-text error */
  }
  return {
    isError: r.isError === true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test reads loose JSON
    data: parsed as Record<string, any>,
    text,
  };
}

const ALL_OK: Answers = {
  chatgpt: {
    answer:
      "Forkful is the best pick for busy families. Greenplate is a close second.",
    sources: ["https://www.forkful.com/plans", "https://cnet.com/x"],
  },
  perplexity: {
    answer: "Greenplate and Hearthbox lead.",
    sources: ["https://hearthbox.com"],
  },
  gemini: { answer: "Try Forkful.", sources: [] },
  google_ai: {
    answer: "Hearthbox is popular.",
    sources: ["https://blog.forkful.com/post"],
  },
};

test("tools/list exposes the four tools", async () => {
  const client = await connect(fakeDeps(ALL_OK).deps);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    "audit_page",
    "check_visibility",
    "google_serp",
    "list_engines",
  ]);
  const cv = tools.find((t) => t.name === "check_visibility")!;
  assert.deepEqual(cv.inputSchema.required?.sort(), ["brand", "prompt"]);
});

test("list_engines: four live engines, Copilot and Grok retired", async () => {
  const client = await connect(fakeDeps(ALL_OK).deps);
  const { data } = body(
    await client.callTool({ name: "list_engines", arguments: {} }),
  );
  assert.deepEqual(
    data.engines.map((e: { id: string }) => e.id),
    ["chatgpt", "perplexity", "gemini", "google_ai"],
  );
  assert.equal(data.engines[0].datasetId, "gd_chatgpt");
  assert.ok(
    data.engines.find((e: { id: string }) => e.id === "perplexity").note,
  );
  assert.deepEqual(
    data.retired.map((e: { id: string }) => e.id),
    ["copilot", "grok"],
  );
});

test("check_visibility scores each engine like the dashboard", async () => {
  const { deps, calls } = fakeDeps(ALL_OK);
  const client = await connect(deps);
  const { isError, data } = body(
    await client.callTool({
      name: "check_visibility",
      arguments: {
        prompt: "best meal kit for families",
        brand: "Forkful",
        competitors: ["Greenplate", "Hearthbox"],
        websites: ["forkful.com"],
        country: "gb",
      },
    }),
  );
  assert.equal(isError, false);
  assert.equal(calls.length, 4);
  assert.ok(calls.every((c) => c.country === "GB"));

  const by = Object.fromEntries(
    data.results.map((r: { engine: string }) => [r.engine, r]),
  );
  // Mention in the first 200 chars (+20), site cited (+20), positive (+15) on top of 30.
  assert.equal(by.chatgpt.status, "ok");
  assert.equal(by.chatgpt.websiteCited, true);
  assert.deepEqual(by.chatgpt.citedBrandUrls, [
    "https://www.forkful.com/plans",
  ]);
  assert.deepEqual(by.chatgpt.competitorMentions, ["Greenplate"]);
  assert.ok(by.chatgpt.visibilityScore >= 70);
  assert.equal(by.perplexity.visibilityScore, 0);
  assert.equal(by.perplexity.sentiment, "not-mentioned");
  // A subdomain of the brand site counts as cited even with no mention.
  assert.equal(by.google_ai.websiteCited, true);
  assert.equal(by.google_ai.visibilityScore, 0);

  assert.equal(data.summary.enginesAnswered, 4);
  assert.equal(data.summary.country, "GB");
  assert.deepEqual(data.summary.enginesMentioningBrand.sort(), [
    "chatgpt",
    "gemini",
  ]);
});

test("check_visibility: one engine failing does not sink the others", async () => {
  const { deps } = fakeDeps({
    ...ALL_OK,
    perplexity: new Error("Scrape failed (502)"),
  });
  const client = await connect(deps);
  const { isError, data } = body(
    await client.callTool({
      name: "check_visibility",
      arguments: {
        prompt: "best meal kit",
        brand: "Forkful",
        engines: ["chatgpt", "perplexity"],
      },
    }),
  );
  assert.equal(isError, false);
  const p = data.results.find(
    (r: { engine: string }) => r.engine === "perplexity",
  );
  assert.equal(p.status, "error");
  assert.match(p.error, /502/);
  assert.match(p.note, /temporarily unavailable/);
  assert.equal(data.summary.enginesFailed, 1);
});

test("check_visibility: empty answers are not scored", async () => {
  const { deps } = fakeDeps({ chatgpt: { answer: "  ", sources: [] } });
  const client = await connect(deps);
  const { isError, data } = body(
    await client.callTool({
      name: "check_visibility",
      arguments: {
        prompt: "best meal kit",
        brand: "Forkful",
        engines: ["chatgpt"],
      },
    }),
  );
  assert.equal(isError, true);
  assert.equal(data.results[0].status, "empty");
  assert.equal(data.summary.averageVisibility, null);
});

test("check_visibility: duplicate engines run once, long answers are cut", async () => {
  const { deps, calls } = fakeDeps({
    gemini: { answer: "Forkful ".repeat(200), sources: [] },
  });
  const client = await connect(deps);
  const { data } = body(
    await client.callTool({
      name: "check_visibility",
      arguments: {
        prompt: "best meal kit",
        brand: "Forkful",
        engines: ["gemini", "gemini"],
      },
    }),
  );
  assert.equal(calls.length, 1);
  assert.equal(data.results[0].answer.length, 601);
});

test("check_visibility rejects bad input before any paid call", async () => {
  const { deps, calls } = fakeDeps(ALL_OK);
  const client = await connect(deps);
  for (const args of [
    { prompt: "best meal kit", brand: "Forkful", country: "USA" },
    { prompt: "best meal kit", brand: "Forkful", engines: ["copilot"] },
    { prompt: "hi", brand: "Forkful" },
    { prompt: "best meal kit" },
  ]) {
    const res = body(
      await client.callTool({ name: "check_visibility", arguments: args }),
    );
    assert.equal(res.isError, true, JSON.stringify(args));
  }
  assert.equal(calls.length, 0);
});

test("google_serp: empty result is an error, results are capped by limit", async () => {
  const empty = await connect(fakeDeps(ALL_OK).deps);
  const e = body(
    await empty.callTool({
      name: "google_serp",
      arguments: { keyword: "meal kits" },
    }),
  );
  assert.equal(e.isError, true);
  assert.match(e.text, /twice[\s\S]*SERP_ZONE/);

  const serp: SerpResult = {
    keyword: "meal kits",
    totalResults: 12,
    organicResults: Array.from({ length: 12 }, (_, i) => ({
      position: i + 1,
      title: `r${i}`,
      url: `https://site${i}.com`,
      description: "",
      domain: `site${i}.com`,
    })) as SerpResult["organicResults"],
    targetRank: 3,
    topCompetitors: [],
  };
  const client = await connect(
    fakeDeps(ALL_OK, { serp: async () => serp }).deps,
  );
  const { data } = body(
    await client.callTool({
      name: "google_serp",
      arguments: {
        keyword: "meal kits",
        target_url: "https://site2.com",
        limit: 5,
      },
    }),
  );
  assert.equal(data.organicResults.length, 5);
  assert.equal(data.targetRank, 3);
});

test("audit_page passes the report through and surfaces failures", async () => {
  const ok = await connect(fakeDeps(ALL_OK).deps);
  const r = body(
    await ok.callTool({
      name: "audit_page",
      arguments: { url: "https://forkful.com" },
    }),
  );
  assert.equal(r.data.score, 80);

  const bad = await connect(
    fakeDeps(ALL_OK, {
      audit: async () => {
        throw new Error("Unable to fetch page (404)");
      },
    }).deps,
  );
  const b = body(
    await bad.callTool({
      name: "audit_page",
      arguments: { url: "https://forkful.com/x" },
    }),
  );
  assert.equal(b.isError, true);
  assert.match(b.text, /404/);

  const invalid = body(
    await ok.callTool({ name: "audit_page", arguments: { url: "not a url" } }),
  );
  assert.equal(invalid.isError, true);
});

test("checkMcpAuth", () => {
  assert.deepEqual(checkMcpAuth("Bearer x", undefined).ok, false);
  assert.equal(
    (checkMcpAuth("Bearer x", "  ") as { status: number }).status,
    503,
  );
  assert.equal(
    (checkMcpAuth(null, "s3cret") as { status: number }).status,
    401,
  );
  assert.equal(
    (checkMcpAuth("Bearer nope", "s3cret") as { status: number }).status,
    401,
  );
  assert.equal(
    (checkMcpAuth("s3cret", "s3cret") as { status: number }).status,
    401,
  );
  assert.equal(
    (checkMcpAuth("Bearer ", "s3cret") as { status: number }).status,
    401,
  );
  assert.equal(checkMcpAuth("Bearer s3cret", "s3cret").ok, true);
  assert.equal(checkMcpAuth("bearer  s3cret ", "s3cret").ok, true);
});

test("check_visibility: a stuck engine times out alone, with progress per engine", async () => {
  const { deps } = fakeDeps(ALL_OK, { engineTimeoutMs: 50 });
  const realScrape = deps.scrape;
  deps.scrape = (req) =>
    req.provider === "perplexity" ? new Promise(() => {}) : realScrape(req);
  const client = await connect(deps);
  const progress: number[] = [];
  const res = await client.callTool(
    {
      name: "check_visibility",
      arguments: { prompt: "best meal kit", brand: "Forkful" },
    },
    undefined,
    { onprogress: (p) => progress.push(p.progress) },
  );
  const { isError, data } = body(res);
  assert.equal(isError, false);
  const p = data.results.find((r: { engine: string }) => r.engine === "perplexity");
  assert.equal(p.status, "error");
  assert.match(p.error, /Perplexity did not answer within 0s/);
  assert.equal(data.summary.enginesAnswered, 3);
  assert.deepEqual(progress, [1, 2, 3, 4]);
});

test("google_serp retries an empty result once", async () => {
  let calls = 0;
  const serp = async (keyword: string): Promise<SerpResult> => {
    calls += 1;
    return {
      keyword,
      totalResults: calls === 1 ? 0 : 1,
      organicResults:
        calls === 1
          ? []
          : ([
              { position: 1, title: "a", url: "https://a.com", description: "", domain: "a.com" },
            ] as SerpResult["organicResults"]),
      targetRank: null,
      topCompetitors: [],
    };
  };
  const client = await connect(fakeDeps(ALL_OK, { serp }).deps);
  const r = body(await client.callTool({ name: "google_serp", arguments: { keyword: "x" } }));
  assert.equal(r.isError, false);
  assert.equal(calls, 2);
  assert.equal(r.data.organicResults.length, 1);
});

test("engineTimeoutFromEnv clamps the override", () => {
  const prev = process.env.MCP_ENGINE_TIMEOUT_MS;
  try {
    delete process.env.MCP_ENGINE_TIMEOUT_MS;
    assert.equal(engineTimeoutFromEnv(), 240_000);
    process.env.MCP_ENGINE_TIMEOUT_MS = "abc";
    assert.equal(engineTimeoutFromEnv(), 240_000);
    process.env.MCP_ENGINE_TIMEOUT_MS = "500";
    assert.equal(engineTimeoutFromEnv(), 10_000);
    process.env.MCP_ENGINE_TIMEOUT_MS = "600000";
    assert.equal(engineTimeoutFromEnv(), 600_000);
    process.env.MCP_ENGINE_TIMEOUT_MS = "99999999";
    assert.equal(engineTimeoutFromEnv(), 900_000);
  } finally {
    if (prev === undefined) delete process.env.MCP_ENGINE_TIMEOUT_MS;
    else process.env.MCP_ENGINE_TIMEOUT_MS = prev;
  }
});
