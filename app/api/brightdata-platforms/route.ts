import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { scrapeAllPlatforms, scrapePlatform, PLATFORMS } from "@/lib/server/brightdata-platforms";

export const maxDuration = 300;

const allSchema = z.object({
  keyword: z.string().min(1).max(200),
  targetUrl: z.string().url(),
});

const singleSchema = z.object({
  keyword: z.string().min(1).max(200),
  targetUrl: z.string().url(),
  platformId: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.platformId) {
      const parsed = singleSchema.parse(body);
      const platform = PLATFORMS.find((p) => p.id === parsed.platformId);
      if (!platform) {
        return NextResponse.json(
          { error: `Unknown platform: ${parsed.platformId}` },
          { status: 400 }
        );
      }
      const result = await scrapePlatform(platform, parsed.keyword, parsed.targetUrl);
      return NextResponse.json(result);
    }

    const parsed = allSchema.parse(body);
    const results = await scrapeAllPlatforms(parsed.keyword, parsed.targetUrl);
    return NextResponse.json(results);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
