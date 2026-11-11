import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runAudit } from "@/lib/server/audit";

export const runtime = "nodejs";

const bodySchema = z.object({
  url: z.string().url(),
});

export async function POST(req: NextRequest) {
  try {
    const { url } = bodySchema.parse(await req.json());
    return NextResponse.json(await runAudit(url));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
