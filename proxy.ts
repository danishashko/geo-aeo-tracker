import { NextRequest, NextResponse } from "next/server";
import { LINK_HEADER, isDemoDeploy, wantsMarkdown } from "@/lib/agent-discovery";

/**
 * Best-effort IP rate limiting for all /api/* routes (Next.js 16 "proxy",
 * formerly middleware).
 *
 * Every route is unauthenticated and several trigger paid Bright Data /
 * OpenRouter / Gemini calls, so without a throttle a single client can run up
 * the deployer's bill. This is in-memory (per instance on serverless, not a
 * global counter) — it stops bursts, not a determined distributed attacker. For
 * hard guarantees, front it with a shared store (Upstash, Vercel KV).
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Per-path budgets (requests per window). The expensive pipelines get tighter caps.
const LIMITS: Record<string, { limit: number; windowMs: number }> = {
  "/api/bulk-sro": { limit: 4, windowMs: 60_000 },
  "/api/scrape": { limit: 20, windowMs: 60_000 },
  "/api/brightdata-platforms": { limit: 12, windowMs: 60_000 },
  "/api/sro-analyze": { limit: 20, windowMs: 60_000 },
  "/api/rank-signal": { limit: 6, windowMs: 60_000 },
};
const DEFAULT_LIMIT = { limit: 30, windowMs: 60_000 };

export const config = { matcher: ["/api/:path*", "/", "/demo"] };

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Agent discovery for the public demo deploy only (see lib/agent-discovery.ts).
  if (path === "/" || path === "/demo") {
    if (!isDemoDeploy()) return NextResponse.next();
    if (wantsMarkdown(req.headers.get("accept"))) {
      const res = NextResponse.rewrite(new URL("/index.md", req.url));
      res.headers.set("Vary", "Accept");
      return res;
    }
    const res = NextResponse.next();
    res.headers.set("Vary", "Accept");
    if (path === "/") res.headers.set("Link", LINK_HEADER);
    return res;
  }

  const rule = LIMITS[path] ?? DEFAULT_LIMIT;

  const ip = (
    req.headers.get("x-forwarded-for")?.split(",")[0] ??
    req.headers.get("x-real-ip") ??
    "unknown"
  ).trim();
  const key = `${ip}:${path}`;
  const now = Date.now();

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    // Opportunistic cleanup so the map can't grow without bound.
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    }
    return NextResponse.next();
  }

  if (bucket.count >= rule.limit) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  bucket.count += 1;
  return NextResponse.next();
}
