import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LINK_HEADER,
  isDemoDeploy,
  llmsFullTxt,
  llmsTxt,
  robotsTxt,
  siteOrigin,
  sitemapUrls,
  wantsMarkdown,
} from "./agent-discovery";

const ORIGIN = "https://demo.example";

test("isDemoDeploy only accepts the string true", () => {
  assert.equal(isDemoDeploy("true"), true);
  assert.equal(isDemoDeploy(" TRUE "), true);
  assert.equal(isDemoDeploy("false"), false);
  assert.equal(isDemoDeploy("1"), false);
  assert.equal(isDemoDeploy(undefined), false);
});

test("siteOrigin priority: explicit, Vercel, localhost", () => {
  assert.equal(
    siteOrigin({
      NEXT_PUBLIC_SITE_URL: "https://a.example/",
      VERCEL_PROJECT_PRODUCTION_URL: "b.example",
    }),
    "https://a.example",
  );
  assert.equal(
    siteOrigin({ VERCEL_PROJECT_PRODUCTION_URL: "b.example" }),
    "https://b.example",
  );
  assert.equal(siteOrigin({}), "http://localhost:3000");
});

test("siteOrigin normalizes a scheme-less or malformed NEXT_PUBLIC_SITE_URL", () => {
  assert.equal(
    siteOrigin({ NEXT_PUBLIC_SITE_URL: "mytracker.example.com" }),
    "https://mytracker.example.com",
  );
  assert.equal(
    siteOrigin({ NEXT_PUBLIC_SITE_URL: "mytracker.example.com//" }),
    "https://mytracker.example.com",
  );
  assert.equal(
    siteOrigin({ NEXT_PUBLIC_SITE_URL: "http://localhost:4000/" }),
    "http://localhost:4000",
  );
  assert.equal(
    siteOrigin({ NEXT_PUBLIC_SITE_URL: "https://" }),
    "http://localhost:3000",
  );
  assert.equal(
    siteOrigin({ NEXT_PUBLIC_SITE_URL: "ftp://files.example" }),
    "http://localhost:3000",
  );
});

test("llms-full lists /api/rank-signal and Rank Signal", () => {
  const txt = llmsFullTxt(ORIGIN);
  assert.match(txt, /POST \/api\/rank-signal/);
  assert.match(txt, /Rank Signal: paired A\/B tests/);
  assert.match(llmsTxt(ORIGIN), /\/api\/rank-signal\/route\.ts/);
});

test("robots: demo allows AI bots, adds Content-Signal and sitemap", () => {
  const txt = robotsTxt(true, ORIGIN);
  for (const bot of [
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "ClaudeBot",
    "Claude-User",
    "Claude-SearchBot",
    "PerplexityBot",
    "Perplexity-User",
    "Google-Extended",
    "Applebot-Extended",
    "Bingbot",
  ]) {
    assert.match(txt, new RegExp(`User-agent: ${bot}\nAllow: /`));
  }
  assert.match(txt, /Content-Signal: search=yes, ai-input=yes, ai-train=yes/);
  assert.match(txt, /Sitemap: https:\/\/demo\.example\/sitemap\.xml/);
  assert.doesNotMatch(txt, /Disallow: \/\n/);
  assert.equal(
    txt.match(/Disallow: \/api\//g)?.length,
    txt.match(/User-agent:/g)?.length,
  );
});

test("robots: private self-host disallows everything, no sitemap", () => {
  const txt = robotsTxt(false, ORIGIN);
  assert.equal(txt, "User-agent: *\nDisallow: /\n");
  assert.deepEqual(sitemapUrls(false, ORIGIN), []);
});

test("sitemap lists / and /demo on demo", () => {
  assert.deepEqual(sitemapUrls(true, ORIGIN), [`${ORIGIN}/`, `${ORIGIN}/demo`]);
});

test("wantsMarkdown", () => {
  assert.equal(wantsMarkdown("text/markdown"), true);
  assert.equal(wantsMarkdown("text/markdown, text/html;q=0.9"), true);
  assert.equal(wantsMarkdown("text/markdown;q=0.5, text/html;q=0.9"), false);
  assert.equal(
    wantsMarkdown("text/html,application/xhtml+xml,*/*;q=0.8"),
    false,
  );
  assert.equal(wantsMarkdown("*/*"), false);
  assert.equal(wantsMarkdown("text/markdown;q=0"), false);
  assert.equal(wantsMarkdown(null), false);
  assert.equal(wantsMarkdown(""), false);
});

test("Link header carries all five relations", () => {
  for (const rel of [
    'rel="llms-txt"',
    'rel="llms-full-txt"',
    'rel="sitemap"',
    'rel="alternate"; type="text/markdown"',
    'rel="describedby"',
  ]) {
    assert.ok(LINK_HEADER.includes(rel), rel);
  }
});

test("llms content: format, no em/en dashes, links present", () => {
  const short = llmsTxt(ORIGIN);
  const full = llmsFullTxt(ORIGIN);
  for (const txt of [short, full]) {
    assert.doesNotMatch(txt, /[\u2013\u2014]/);
    assert.match(txt, /^# GEO\/AEO Tracker\n\n> /);
  }
  assert.match(short, /\n## .+\n\n- \[.+\]\(https?:\/\/.+\)/);
  assert.ok(
    short.includes(
      "https://github.com/danishashko/geo-aeo-tracker/blob/main/AGENTS.md",
    ),
  );
  assert.ok(short.includes(`${ORIGIN}/demo`));
  assert.ok(short.includes("/app/api/scrape/route.ts"));
  assert.ok(full.includes("## Quick start"));
  assert.ok(full.includes("## Environment variables"));
});

test("llms-full: first 150 words say what it is and who it is for", () => {
  const first = llmsFullTxt(ORIGIN).split(/\s+/).slice(0, 150).join(" ");
  assert.match(first, /dashboard/);
  assert.match(
    first,
    /ChatGPT, Perplexity, Gemini, Copilot and Google AI Mode/,
  );
  assert.match(first, /marketers, SEO leads and founders/);
});
