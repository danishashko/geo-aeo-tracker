import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPassagePool,
  countWords,
  expandPool,
  isHeadlineList,
  resetExpansionCache,
  POOL_MAX,
  hashPassage,
  parseBlocks,
  segmentPage,
  MAX_WORDS,
  MIN_WORDS,
  SPLIT_WORDS,
  TOP_PER_PAGE,
} from "./rank-signal-passages";
import type { ScrapedPage, SerpResult } from "./sro-types";

function sentence(i: number, topic = "meal kits"): string {
  return `Sentence ${i} explains how ${topic} save time for busy families every week.`;
}

function paragraph(start: number, count: number, topic?: string): string {
  return Array.from({ length: count }, (_, i) =>
    sentence(start + i, topic),
  ).join(" ");
}

function page(fullText: string, domain = "example.com"): ScrapedPage {
  return {
    url: `https://${domain}/`,
    domain,
    title: "",
    headings: [],
    wordCount: countWords(fullText),
    contentSnippet: "",
    fullText,
    metaDescription: "",
  };
}

test("chunks land in 60-180 words (≤ 220 after a split)", () => {
  const md = [
    "# Guide",
    paragraph(0, 3),
    paragraph(3, 3),
    paragraph(6, 3),
    "## Costs",
    paragraph(9, 30), // ~360 words, must split at sentence ends
  ].join("\n\n");
  const chunks = segmentPage(md);
  assert.ok(chunks.length >= 3);
  for (const c of chunks) {
    const w = countWords(c.text);
    assert.ok(w >= MIN_WORDS, `too short: ${w}`);
    assert.ok(w <= SPLIT_WORDS, `too long: ${w}`);
  }
  const costs = chunks.filter((c) => c.heading === "Costs");
  assert.ok(costs.length >= 2, "long section splits");
  for (const c of costs) {
    assert.ok(countWords(c.text) <= MAX_WORDS + 20);
    assert.match(c.text, /\.$/, "split at a sentence end");
  }
});

test("headings are stored separately and never in the body", () => {
  const md = `## What is a meal kit?\n\n${paragraph(0, 6)}`;
  const [chunk] = segmentPage(md);
  assert.equal(chunk.heading, "What is a meal kit?");
  assert.doesNotMatch(chunk.text, /^#/m);
});

test("chunks never cross a heading", () => {
  const md = `## A\n\n${paragraph(0, 5)}\n\n## B\n\n${paragraph(5, 5)}`;
  const chunks = segmentPage(md);
  assert.deepEqual(
    chunks.map((c) => c.heading),
    ["A", "B"],
  );
});

test("boilerplate is dropped: cookies, link-heavy, tables, code, menus", () => {
  const body = paragraph(0, 6);
  const md = [
    "We use cookies to improve your experience. Accept all cookies to continue browsing the site today.",
    "[Home](https://x.com/) [Pricing](https://x.com/p) [Blog](https://x.com/b) [About us](https://x.com/a) read more",
    "| Plan | Price |\n|---|---|\n| Basic | $9 |",
    "```js\nconsole.log('code');\n```",
    "Home\nPricing\nBlog\nContact",
    body,
    "© 2026 Example Inc. All rights reserved.",
  ].join("\n\n");
  const blocks = parseBlocks(md);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].text, body);
});

test("fragments under 3 sentences are dropped unless list-shaped", () => {
  const twoLong =
    "This single sentence about meal kits keeps going with many many words so that it passes the sixty word minimum on its own and then some more words are added here to be very sure it is long enough, which it now is, and it continues for a while longer still with a few extra words. " +
    "A second sentence closes it.";
  assert.ok(countWords(twoLong) >= MIN_WORDS);
  assert.equal(segmentPage(twoLong).length, 0);

  const list = Array.from(
    { length: 6 },
    (_, i) =>
      `- Item ${i} covers delivery windows, recipe variety and portion sizes for families`,
  ).join("\n");
  assert.equal(segmentPage(list).length, 1);
});

test("link markup and URLs never reach the passage text", () => {
  const md = `${paragraph(0, 5)} See [our guide](https://example.com/guide) or https://example.com/raw for more.`;
  const [chunk] = segmentPage(md);
  assert.doesNotMatch(chunk.text, /https?:|\]\(/);
  assert.match(chunk.text, /our guide/);
});

test("hashPassage normalizes case and whitespace", () => {
  assert.equal(hashPassage("Hello   World\n"), hashPassage("hello world"));
  assert.notEqual(hashPassage("hello world"), hashPassage("hello there"));
  assert.match(hashPassage("x"), /^[0-9a-f]{40}$/);
});

test("pool: top 15 per page, deduped, ranked by query overlap, origin tagged", () => {
  const sections = Array.from(
    { length: 20 },
    (_, i) =>
      `## Part ${i}\n\n${paragraph(i * 10, 6, i % 2 ? "meal kits" : "garden tools")}`,
  ).join("\n\n");
  const target = page(sections, "target.com");
  const dup = page(sections, "copy.com");
  const { passages, targetUsed } = buildPassagePool({
    keyword: "healthy meal kits",
    targetPage: target,
    competitorPages: [dup, { ...page("", "down.com"), error: "HTTP 500" }],
  });
  assert.ok(targetUsed);
  assert.equal(passages.length, TOP_PER_PAGE, "duplicates removed");
  assert.ok(passages.every((p) => p.origin === "target"));
  // Meal-kit passages outrank garden-tool passages
  assert.match(passages[0].text, /meal kits/);
  for (let i = 1; i < passages.length; i++)
    assert.ok(passages[i - 1].score >= passages[i].score);
});

test("pool without a usable target runs on competitors only", () => {
  const { passages, targetUsed } = buildPassagePool({
    keyword: "meal kits",
    targetPage: { ...page(""), error: "blocked" },
    competitorPages: [page(`## A\n\n${paragraph(0, 6)}`, "c.com")],
  });
  assert.equal(targetUsed, false);
  assert.equal(passages.length, 1);
  assert.equal(passages[0].origin, "competitor");
});

// Exact markdown from zapier.com/blog/best-project-management-software/
// (live scrape, 2026-09-25): the "Related articles" cards that reached the
// judge as an S02 pair before this filter existed.
const ZAPIER_RELATED = String.raw`## Related articles

*   [![Hero image with the logos of the best PPM tools](https://images.ctfassets.net/lzny33ho1g45/27glKQ1ObOcd8jxTu70Fvz/8145b2f30eaa607fb9175f747bd542b5/best-ppm-software-hero.jpg?fm=jpg&q=31&fit=thumb&w=896)](/blog/ppm-software/)
    
    [
    
    App tips
    
    ](/blog/all-articles/app-tips)[
    
    The 7 best PPM software tools in 2026
    
    The 7 best PPM software tools in 2026
    
    ](/blog/ppm-software/)
    
*   [![A hero image with the logos of the best project management software for small business](https://images.ctfassets.net/lzny33ho1g45/3PgMDxGMKlu7VWhluVpQRe/f55d228e93d6949f71f6202f600c3eb3/best-project-management-small-business.jpg?fm=jpg&q=31&fit=thumb&w=896)](/blog/best-project-management-software-small-business/)
    
    [
    
    Best apps
    
    ](/blog/all-articles/best-apps)[
    
    The best project management software for small businesses in 2026
    
    The best project management software for...
    
    ](/blog/best-project-management-software-small-business/)
    
*   [![Hero image with the logos of the best Trello alternatives](https://images.ctfassets.net/lzny33ho1g45/2hZcPkJY7M5pGbsHhFXmkz/3513080fb55f4ea382e53f220938ecee/trello-alternatives.jpg?fm=jpg&q=31&fit=thumb&w=896)](/blog/trello-alternatives/)
    
    [
    
    Best apps
    
    ](/blog/all-articles/best-apps)[
    
    The 9 best Trello alternatives in 2026
    
    The 9 best Trello alternatives in 2026
    
    ](/blog/trello-alternatives/)
    
*   [![Trello logo against a dotted beige background.](https://images.ctfassets.net/lzny33ho1g45/2gCya3PujHCc3y9vU8qFoi/6053984d06ed8bd47f9b4cf40f1fa925/trello-hero-neutral.png?fm=jpg&q=31&fit=thumb&w=896)](/blog/how-to-use-trello/)
    
    [
    
    App tips
    
    ](/blog/all-articles/app-tips)[
    
    What is Trello? And how to use it
    
    What is Trello? And how to use it
    
    ](/blog/how-to-use-trello/)
    
*   [![Trello app logo against a checkered green background. ](https://images.ctfassets.net/lzny33ho1g45/7iQcIw6aek77BJE2pSN295/be80962ea5fdd1794e065a4f0a4fe1d1/trello-hero-green.png?fm=jpg&q=31&fit=thumb&w=896)](/blog/trello-board-examples/)
    
    [
    
    App tips
    
    ](/blog/all-articles/app-tips)[
    
    Trello board examples: 16 ways to use Trello to organize everything
    
    Trello board examples: 16 ways to use Trello...
    
    ](/blog/trello-board-examples/)
    
*   [![A hero image of the monday.com app logo connected to other app logos on a purple background.](https://images.ctfassets.net/lzny33ho1g45/7G0lB8y93R5Y5qaLrEetK/8b284a2d3c0f8c88445093282ae3daa6/automate-monday-00-hero.jpg?fm=jpg&q=31&fit=thumb&w=896)](/blog/automate-monday/)
    
    [
    
    Automation inspiration
    
    ](/blog/all-articles/automation-inspiration)[
    
    Use Zapier's monday integration to streamline your work
    
    Use Zapier's monday integration to...
    
    ](/blog/automate-monday/)
    
*   [![Hero image with the Asana and monday.com logos](https://images.ctfassets.net/lzny33ho1g45/monday-vs-asana-p-img/68a88c59fdcf112e9e6c4f76838231c0/asana-vs-monday-hero.jpg?fm=jpg&q=31&fit=thumb&w=896)](/blog/monday-vs-asana/)
    
    [
    
    App comparisons
    
    ](/blog/all-articles/app-comparisons)[
    
    Asana vs. monday: Which project management software is best? \[2026\]
    
    Asana vs. monday: Which project management...
    
    ](/blog/monday-vs-asana/)
    
*   [![A hero image for app comparisons, with the ClickUp and Asana logos](https://images.ctfassets.net/lzny33ho1g45/2H6ILHAl8nRcpAJPfHhv3k/9412d9c932a1480f71ae6179874830bc/Group_9908.jpg?fm=jpg&q=31&fit=thumb&w=896)](/blog/clickup-vs-asana/)
    
    [
    
    App comparisons
    
    ](/blog/all-articles/app-comparisons)[
    
    ClickUp vs. Asana: Which project management software should you use? \[2026\]
    
    ClickUp vs. Asana: Which project management...
    
    ](/blog/clickup-vs-asana/)
    
`;

// The same section as the judge saw it after cleaning (duplicates included).
const ZAPIER_RELATED_AS_JUDGED = [
  "The 7 best PPM software tools in 2026",
  "The 7 best PPM software tools in 2026",
  "The best project management software for small businesses in 2026",
  "The best project management software for...",
  "The 9 best Trello alternatives in 2026",
  "The 9 best Trello alternatives in 2026",
  "What is Trello? And how to use it",
  "What is Trello? And how to use it",
  "Trello board examples: 16 ways to use Trello to organize everything",
  "Trello board examples: 16 ways to use Trello...",
  "Use Zapier's monday integration to streamline your work",
  "Use Zapier's monday integration to...",
].join("\n\n");

test("zapier related-articles section never becomes a passage", () => {
  assert.equal(segmentPage(ZAPIER_RELATED).length, 0);
  // Without the telling heading, the title-run and dedupe rules still drop it
  const renamed = ZAPIER_RELATED.replace("## Related articles", "## Tools we like");
  assert.equal(segmentPage(renamed).length, 0);
  assert.ok(isHeadlineList(ZAPIER_RELATED_AS_JUDGED));
  assert.equal(segmentPage(ZAPIER_RELATED_AS_JUDGED).length, 0);
});

test("repeated blocks are kept once", () => {
  const para = paragraph(0, 6);
  const blocks = parseBlocks(`${para}\n\n${para}\n\n${paragraph(6, 6)}`);
  assert.equal(blocks.length, 2);
});

test("prose with a few short lines is not a headline list", () => {
  const md = [
    "Key takeaways",
    paragraph(0, 3),
    paragraph(3, 3),
    paragraph(6, 3),
  ].join("\n");
  assert.equal(isHeadlineList(md), false);
});

// ─── SERP top-10 pool expansion ─────────────────────────────────────────

function sectionsPage(url: string, n: number, seed: number): ScrapedPage {
  const md = Array.from(
    { length: n },
    (_, i) => `## Part ${i}\n\n${paragraph(seed + i * 10, 6, `meal kits from ${new URL(url).hostname.split(".")[0]}`)}`,
  ).join("\n\n");
  return { ...page(md, new URL(url).hostname), url };
}

function serpOf(urls: string[], targetUrl: string): SerpResult {
  return {
    keyword: "meal kits",
    totalResults: urls.length,
    targetRank: null,
    topCompetitors: urls.slice(0, 5),
    organicResults: urls.map((url, i) => ({
      position: i + 1,
      url,
      domain: new URL(url).hostname,
      title: "",
      description: "",
      isTarget: url === targetUrl,
    })),
  };
}

test("expandPool tops a small pool up from the SERP top 10, capped at 60", async () => {
  resetExpansionCache();
  const target = "https://target.example/page";
  const base = buildPassagePool({
    keyword: "meal kits",
    targetPage: sectionsPage(target, 10, 0),
    competitorPages: [sectionsPage("https://known.example/a", 10, 500)],
  }).passages;
  assert.equal(base.length, 20);
  const serpUrls = [
    target,
    "https://known.example/a/",
    ...Array.from({ length: 9 }, (_, i) => `https://s${i}.example/x`),
  ];
  const scraped: string[] = [];
  let serpCalls = 0;
  const deps = {
    fetchSerp: async () => {
      serpCalls++;
      return serpOf(serpUrls, target);
    },
    scrapePages: async (urls: string[]) => {
      scraped.push(...urls);
      return urls.map((u, i) => sectionsPage(u, 15, 1000 + scraped.length * 100 + i));
    },
  };
  const input = {
    keyword: "meal kits",
    targetUrl: target,
    passages: base,
    knownUrls: [target, "https://known.example/a"],
  };
  const out = await expandPool(input, deps);
  assert.equal(out.passages.length, POOL_MAX);
  assert.equal(out.added, POOL_MAX - 20);
  assert.ok(!scraped.includes(target), "target skipped");
  assert.ok(!scraped.some((u) => u.includes("known.example")), "known page skipped");
  assert.equal(scraped.length, 8, "top 10 minus target and known page");
  assert.ok(out.passages.every((p, i, a) => i === 0 || a[i - 1].score >= p.score));
  // Base passages are all kept
  const hashes = new Set(out.passages.map((p) => p.hash));
  assert.ok(base.every((p) => hashes.has(p.hash)));
  // A second signal of the same run reuses the cached SERP + scrape
  await expandPool(input, deps);
  assert.equal(serpCalls, 1);
  assert.equal(scraped.length, 8);
});

test("expandPool leaves a pool of 40+ alone and survives a failed SERP", async () => {
  resetExpansionCache();
  let calls = 0;
  const big = Array.from({ length: 40 }, (_, i) => ({
    text: `t${i}`,
    heading: "",
    origin: "competitor" as const,
    domain: "x",
    hash: `h${i}`,
    score: 1,
  }));
  const r1 = await expandPool(
    { keyword: "k", targetUrl: "https://t.example/", passages: big, knownUrls: [] },
    { fetchSerp: async () => { calls++; return serpOf([], ""); } },
  );
  assert.equal(r1.added, 0);
  assert.equal(calls, 0);
  const r2 = await expandPool(
    { keyword: "k", targetUrl: "https://t.example/", passages: big.slice(0, 10), knownUrls: [] },
    { fetchSerp: async () => { calls++; return serpOf([], ""); }, scrapePages: async () => [] },
  );
  assert.equal(r2.added, 0);
  assert.equal(r2.passages.length, 10);
  assert.equal(calls, 3, "empty SERP is tried 3 times");
});

test("expandPool negative-caches an empty SERP for later signals of the run", async () => {
  resetExpansionCache();
  let serpCalls = 0;
  const deps = {
    fetchSerp: async () => {
      serpCalls++;
      return serpOf([], "");
    },
    scrapePages: async () => [],
  };
  const input = {
    keyword: "k",
    targetUrl: "https://t.example/",
    passages: [],
    knownUrls: [],
  };
  await expandPool(input, deps);
  assert.equal(serpCalls, 3, "first expansion retries up to 3 times");
  for (let i = 0; i < 14; i++) await expandPool(input, deps);
  assert.equal(serpCalls, 3, "the other signals reuse the failed result");
});

test("expandPool negative-caches a throwing SERP, but not an aborted one", async () => {
  resetExpansionCache();
  let serpCalls = 0;
  const input = {
    keyword: "k2",
    targetUrl: "https://t.example/",
    passages: [],
    knownUrls: [],
  };
  const failing = {
    fetchSerp: async () => {
      serpCalls++;
      throw new Error("boom");
    },
  };
  await expandPool(input, failing);
  await expandPool(input, failing);
  assert.equal(serpCalls, 1);

  resetExpansionCache();
  serpCalls = 0;
  const ac = new AbortController();
  const aborting = {
    signal: ac.signal,
    fetchSerp: async () => {
      serpCalls++;
      ac.abort();
      throw new Error("aborted");
    },
  };
  await expandPool(input, aborting);
  await new Promise((r) => setTimeout(r, 0));
  await expandPool(input, { fetchSerp: async () => { serpCalls++; return serpOf([], ""); } });
  assert.equal(serpCalls, 4, "an aborted expansion is not cached (1 + 3 retries)");
});

test("expandPool stops retrying and scraping once the signal aborts", async () => {
  resetExpansionCache();
  const ac = new AbortController();
  let serpCalls = 0;
  await expandPool(
    { keyword: "k3", targetUrl: "https://t.example/", passages: [], knownUrls: [] },
    {
      signal: ac.signal,
      fetchSerp: async () => {
        serpCalls++;
        ac.abort();
        return serpOf([], "");
      },
    },
  );
  assert.equal(serpCalls, 1);
});
