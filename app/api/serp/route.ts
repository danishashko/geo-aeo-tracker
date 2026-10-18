import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchSerp } from "@/lib/server/serp";

const requestSchema = z.object({
  keyword: z.string().min(1).max(200),
  targetUrl: z.string().url(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = requestSchema.parse(body);
    const result = await fetchSerp(parsed.keyword, parsed.targetUrl);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
