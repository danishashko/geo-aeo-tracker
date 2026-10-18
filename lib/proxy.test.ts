import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

const req = (path: string, accept = "text/html") =>
  new NextRequest(`http://localhost:3000${path}`, {
    headers: { "x-forwarded-for": "9.9.9.9", accept },
  });

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
  const statuses = Array.from({ length: 31 }, () => proxy(req("/api/serp")).status);
  assert.equal(statuses[29], 200);
  assert.equal(statuses[30], 429);
});
