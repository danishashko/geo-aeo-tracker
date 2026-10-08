import { test } from "node:test";
import assert from "node:assert/strict";
import { AI_CRAWLERS, isAllowed, parseRobots } from "../lib/server/robots.ts";

const allowed = (robots, agent, path = "/") =>
  isAllowed(parseRobots(robots), agent, path);

test("no rules allows everything", () => {
  assert.equal(allowed("", "GPTBot"), true);
  assert.equal(allowed("Sitemap: https://x.com/sitemap.xml", "GPTBot"), true);
});

test("an agent's own group is not leaked into by a later Disallow", () => {
  // The old regex matched "user-agent: gptbot ... disallow: /" across groups
  // and reported GPTBot as blocked here.
  const robots = `User-agent: GPTBot
Allow: /

User-agent: *
Disallow: /admin`;
  assert.equal(allowed(robots, "GPTBot", "/pricing"), true);
  assert.equal(allowed(robots, "GPTBot", "/admin"), true);
  assert.equal(allowed(robots, "Bingbot", "/admin"), false);
});

test("wildcard group applies to crawlers without their own group", () => {
  const robots = "User-agent: *\nDisallow: /";
  assert.equal(allowed(robots, "OAI-SearchBot", "/"), false);
  assert.equal(allowed(robots, "PerplexityBot", "/blog"), false);
});

test("a specific group overrides the wildcard group", () => {
  const robots = `User-agent: *
Disallow: /

User-agent: OAI-SearchBot
Allow: /`;
  assert.equal(allowed(robots, "OAI-SearchBot"), true);
  assert.equal(allowed(robots, "GPTBot"), false);
});

test("agent matching is case-insensitive and ignores version suffix", () => {
  const robots = "user-agent: gptbot/1.2\ndisallow: /";
  assert.equal(allowed(robots, "GPTBot"), false);
});

test("Disallow: /x does not block other paths; empty Disallow allows all", () => {
  assert.equal(allowed("User-agent: GPTBot\nDisallow: /private", "GPTBot", "/"), true);
  assert.equal(allowed("User-agent: GPTBot\nDisallow: /private", "GPTBot", "/private/a"), false);
  assert.equal(allowed("User-agent: GPTBot\nDisallow:", "GPTBot", "/"), true);
});

test("consecutive User-agent lines share one group", () => {
  const robots = `User-agent: GPTBot
User-agent: ClaudeBot
Disallow: /`;
  assert.equal(allowed(robots, "GPTBot"), false);
  assert.equal(allowed(robots, "ClaudeBot"), false);
  assert.equal(allowed(robots, "PerplexityBot"), true);
});

test("groups naming the same agent are merged", () => {
  const robots = `User-agent: GPTBot
Disallow: /a

User-agent: GPTBot
Disallow: /b`;
  assert.equal(allowed(robots, "GPTBot", "/a"), false);
  assert.equal(allowed(robots, "GPTBot", "/b"), false);
  assert.equal(allowed(robots, "GPTBot", "/c"), true);
});

test("longest match wins and Allow wins a tie", () => {
  const robots = `User-agent: *
Disallow: /docs
Allow: /docs/public`;
  assert.equal(allowed(robots, "Googlebot", "/docs/private"), false);
  assert.equal(allowed(robots, "Googlebot", "/docs/public/page"), true);
  assert.equal(allowed("User-agent: *\nDisallow: /a\nAllow: /a", "Googlebot", "/a"), true);
});

test("* and $ wildcards", () => {
  const robots = `User-agent: *
Disallow: /*.pdf$
Disallow: /search*q=`;
  assert.equal(allowed(robots, "Bingbot", "/file.pdf"), false);
  assert.equal(allowed(robots, "Bingbot", "/file.pdf?x=1"), true);
  assert.equal(allowed(robots, "Bingbot", "/search?q=test"), false);
  assert.equal(allowed(robots, "Bingbot", "/search"), true);
});

test("comments, CRLF and Sitemap lines inside a group are handled", () => {
  const robots =
    "User-agent: GPTBot # OpenAI\r\nSitemap: https://x.com/s.xml\r\nDisallow: / # all\r\n";
  assert.equal(allowed(robots, "GPTBot"), false);
});

test("rules before any User-agent line are ignored", () => {
  assert.equal(allowed("Disallow: /\nUser-agent: *\nAllow: /", "GPTBot"), true);
});

test("regex metacharacters in patterns are literal", () => {
  assert.equal(allowed("User-agent: *\nDisallow: /a.b", "GPTBot", "/axb"), true);
  assert.equal(allowed("User-agent: *\nDisallow: /a.b", "GPTBot", "/a.b"), false);
});

test("crawler list has unique tokens and both purposes", () => {
  const tokens = AI_CRAWLERS.map((c) => c.token.toLowerCase());
  assert.equal(new Set(tokens).size, tokens.length);
  assert.ok(AI_CRAWLERS.some((c) => c.purpose === "answers"));
  assert.ok(AI_CRAWLERS.some((c) => c.purpose === "training"));
});
