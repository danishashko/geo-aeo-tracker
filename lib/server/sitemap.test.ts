import { test } from "node:test";
import assert from "node:assert/strict";
import { robotsSitemaps, sitemapInfo } from "./sitemap";

test("sitemapInfo reads a urlset and a sitemap index", () => {
  assert.deepEqual(
    sitemapInfo(
      '<?xml version="1.0"?><urlset xmlns="x"><url><loc>a</loc></url><url><loc>b</loc></url></urlset>',
    ),
    { kind: "urlset", count: 2 },
  );
  assert.deepEqual(
    sitemapInfo(
      '<sitemapindex xmlns="x"><sitemap><loc>a.xml</loc></sitemap><sitemap><loc>b.xml</loc></sitemap><sitemap><loc>c.xml</loc></sitemap></sitemapindex>',
    ),
    { kind: "index", count: 3 },
  );
});

test("sitemapInfo rejects HTML and empty bodies", () => {
  assert.equal(
    sitemapInfo("<html><body>Not found, see our url list</body></html>"),
    null,
  );
  assert.equal(sitemapInfo(""), null);
});

test("robotsSitemaps reads every Sitemap: line", () => {
  assert.deepEqual(
    robotsSitemaps(
      "User-agent: *\nDisallow: /x\nSitemap: https://brightdata.com/sitemap_index.xml\n  sitemap:https://brightdata.com/blog.xml\nSitemap: /relative.xml\n",
    ),
    [
      "https://brightdata.com/sitemap_index.xml",
      "https://brightdata.com/blog.xml",
    ],
  );
  assert.deepEqual(robotsSitemaps("User-agent: *\nAllow: /"), []);
});
