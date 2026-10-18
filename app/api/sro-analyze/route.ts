import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { analyzeSRO } from "@/lib/server/openrouter-sro";
import type {
  GroundingResult,
  PlatformResult,
  SerpResult,
  ScrapedPage,
  SiteContext,
} from "@/lib/server/sro-types";

export const runtime = "nodejs";
export const maxDuration = 120;

// These come from prior pipeline stages, so the shapes are large and varied.
// We don't re-validate every field, but we DO require objects (not arbitrary
// scalars) and cap array sizes so a malicious client can't push a giant payload
// straight into an LLM prompt.
const looseObject = z.object({}).passthrough();
const requestSchema = z.object({
  targetUrl: z.string().url(),
  keyword: z.string().min(1).max(500),
  grounding: looseObject.nullable().optional(),
  platforms: z.array(looseObject).max(12).optional().default([]),
  serp: looseObject.nullable().optional(),
  targetPage: looseObject.nullable().optional(),
  competitorPages: z.array(looseObject).max(10).optional().default([]),
  siteContext: looseObject.nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = requestSchema.parse(body);

    const result = await analyzeSRO({
      targetUrl: parsed.targetUrl,
      keyword: parsed.keyword,
      grounding: (parsed.grounding as unknown as GroundingResult) ?? null,
      platforms: (parsed.platforms as unknown as PlatformResult[]) ?? [],
      serp: (parsed.serp as unknown as SerpResult) ?? null,
      targetPage: (parsed.targetPage as unknown as ScrapedPage) ?? null,
      competitorPages:
        (parsed.competitorPages as unknown as ScrapedPage[]) ?? [],
      siteContext: (parsed.siteContext as unknown as SiteContext) ?? null,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
