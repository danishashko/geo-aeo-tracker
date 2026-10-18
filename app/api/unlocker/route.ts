import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertPublicHttpUrl } from "@/lib/server/ssrf";
import { scrapePage, scrapePages } from "@/lib/server/unlocker";

const singleSchema = z.object({
  url: z.string().url(),
});

const batchSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(5),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.urls && Array.isArray(body.urls)) {
      const parsed = batchSchema.parse(body);
      for (const u of parsed.urls) await assertPublicHttpUrl(u);
      const results = await scrapePages(parsed.urls);
      return NextResponse.json(results);
    }

    const parsed = singleSchema.parse(body);
    await assertPublicHttpUrl(parsed.url);
    const result = await scrapePage(parsed.url);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
