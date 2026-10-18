import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

const req = (
  path: string,
  accept = "text/html",
  headers: Record<string, string> = { "x-forwarded-for": "9.9.9.9" },
) => new NextRequest(`http://localhost:3000${path}`, { headers: { accept, ...headers } });

test("page paths never rate limit, in demo or private mode", () => {
  for (const demo of ["true", "false"]) {
    process.env.NEXT_PUBLIC_DEMO_ONLY = demo;
    for (const path of ["/", "/demo"]) {
      for (let i = 0; i < 200; i++) {
        assert.notEqual(proxy(req(path)).status, 429);
      }
    }
  }
});

test("private mode: pages pass through with no discovery headers", () => {
  process.env.NEXT_PUBLIC_DEMO_ONLY = "false";
  const res = proxy(req("/", "text/markdown"));
  assert.equal(res.headers.get("link"), null);
  assert.equal(res.headers.get("x-middleware-rewrite"), null);
});

test("demo mode: / gets Link header, markdown Accept rewrites to /index.md", () => {
  process.env.NEXT_PUBLIC_DEMO_ONLY = "true";
  assert.ok(proxy(req("/")).headers.get("link")?.includes('rel="llms-txt"'));
  assert.match(
    proxy(req("/", "text/markdown")).headers.get("x-middleware-rewrite") ?? "",
    /\/index\.md$/,
  );
});

test("api paths still rate limit", () => {
  process.env.NEXT_PUBLIC_DEMO_ONLY = "false";
  const statuses = Array.from({ length: 31 }, () => proxy(req("/api/serp")).status);
  assert.equal(statuses[29], 200);
  assert.equal(statuses[30], 429);
});

test("demo deploy: every /api path is 403 before rate limiting", async () => {
  process.env.NEXT_PUBLIC_DEMO_ONLY = "true";
  for (const path of ["/api/analyze", "/api/serp", "/api/unlocker"]) {
    for (let i = 0; i < 40; i++) {
      const res = proxy(req(path));
      assert.equal(res.status, 403);
      assert.deepEqual(await res.json(), {
        error: "Live API calls are disabled on this demo.",
      });
    }
  }
});

test("spoofed x-forwarded-for entries do not bypass the limit", () => {
  process.env.NEXT_PUBLIC_DEMO_ONLY = "false";
  // Real proxy appends 7.7.7.7; the client rotates the first entry.
  const statuses = Array.from(
    { length: 31 },
    (_, i) =>
      proxy(req("/api/spoof", "text/html", { "x-forwarded-for": `1.1.1.${i}, 7.7.7.7` }))
        .status,
  );
  assert.equal(statuses[29], 200);
  assert.equal(statuses[30], 429);
});

test("x-vercel-forwarded-for wins over a spoofed x-forwarded-for", () => {
  process.env.NEXT_PUBLIC_DEMO_ONLY = "false";
  const statuses = Array.from(
    { length: 31 },
    (_, i) =>
      proxy(
        req("/api/vercel-ip", "text/html", {
          "x-vercel-forwarded-for": "5.5.5.5",
          "x-forwarded-for": `2.2.2.${i}`,
        }),
      ).status,
  );
  assert.equal(statuses[30], 429);
});
