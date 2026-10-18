import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchWithTimeout } from "@/lib/server/http";

// Node (not edge): battlecard/large generations exceed the edge duration cap.
export const runtime = "nodejs";
// Allow long LLM generations (battlecards request up to ~4k tokens). Vercel
// honours this up to the plan limit (60s Hobby / 300s Pro).
export const maxDuration = 120;

const DEFAULT_MODEL = "google/gemini-3.5-flash";
// Models the app's own UI requests (battlecards pin DEFAULT_MODEL). Anything
// else falls back to the server default so this isn't an open LLM proxy.
const ALLOWED_MODELS = new Set([DEFAULT_MODEL]);

const bodySchema = z.object({
  // Largest prompt the app builds is a few KB (brand context + template).
  prompt: z.string().min(5).max(20_000),
  // Callers use 256, 1300 and 1500.
  maxTokens: z.number().int().min(128).max(2000).optional(),
  temperature: z.number().min(0).max(1.5).optional(),
  skipCache: z.boolean().optional(),
  // Optional per-request model override (e.g. structured-output tasks).
  model: z.string().min(1).max(120).optional(),
});

const cache = new Map<string, { expiresAt: number; text: string }>();

export async function POST(req: NextRequest) {
  try {
    const parsed = bodySchema.parse(await req.json());
    const serverModel = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
    const model =
      parsed.model &&
      (parsed.model === serverModel || ALLOWED_MODELS.has(parsed.model))
        ? parsed.model
        : serverModel;
    const cacheKey = createHash("sha256")
      .update(
        JSON.stringify({
          prompt: parsed.prompt,
          maxTokens: parsed.maxTokens ?? 900,
          temperature: parsed.temperature ?? 0.2,
          model,
        }),
      )
      .digest("hex");

    if (!parsed.skipCache) {
      const hit = cache.get(cacheKey);
      if (hit && hit.expiresAt > Date.now()) {
        return NextResponse.json({ text: hit.text, cached: true });
      }
    } else {
      cache.delete(cacheKey);
    }

    const key = process.env.OPENROUTER_KEY;
    if (!key) {
      // Server misconfiguration, not a client error.
      return NextResponse.json(
        { error: "LLM analysis is not configured on this deployment." },
        { status: 503 },
      );
    }

    const response = await fetchWithTimeout(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: parsed.prompt,
            },
          ],
          max_tokens: parsed.maxTokens ?? 900,
          temperature: parsed.temperature ?? 0.2,
        }),
      },
      110_000,
    );

    if (!response.ok) {
      // Log the upstream body server-side; never forward it (it can carry
      // provider internals). Return a generic message to the client.
      const text = await response.text().catch(() => "");
      console.error(
        `[analyze] OpenRouter ${response.status}: ${text.slice(0, 500)}`,
      );
      return NextResponse.json(
        { error: "LLM analysis failed. Please try again." },
        { status: 502 },
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const text = payload.choices?.[0]?.message?.content ?? "";
    // Bound the cache so unique prompts can't grow it without limit.
    if (cache.size > 500) {
      const now = Date.now();
      for (const [k, v] of cache) if (v.expiresAt <= now) cache.delete(k);
      while (cache.size > 500) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
      }
    }
    cache.set(cacheKey, {
      text,
      expiresAt: Date.now() + 1000 * 60 * 30,
    });

    return NextResponse.json({ text, cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
