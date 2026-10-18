import { NextRequest } from "next/server";
import { z } from "zod";
import { analyzeGrounding } from "@/lib/server/gemini-grounding";
import { scrapeAllPlatforms } from "@/lib/server/brightdata-platforms";
import { fetchSerp } from "@/lib/server/serp";
import { scrapePage, scrapePages } from "@/lib/server/unlocker";
import { analyzeSRO } from "@/lib/server/openrouter-sro";
import type {
  BulkItemProgress,
  BulkAnalysisResult,
  AnalysisInput,
  PlatformResult,
  ScrapedPage,
} from "@/lib/server/sro-types";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({
  items: z
    .array(
      z.object({
        url: z.string().url(),
        keyword: z.string().min(1).max(200),
      }),
    )
    .min(1)
    .max(5),
});

function sseEvent(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  let items: AnalysisInput[];
  try {
    const body = await req.json();
    const parsed = requestSchema.parse(body);
    items = parsed.items;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  // Tracks client disconnect so we stop running (and stop paying for) the
  // remaining items once nobody is listening.
  let cancelled = false;
  req.signal.addEventListener("abort", () => {
    cancelled = true;
  });

  const isStopped = () => cancelled || req.signal.aborted;

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      function send(type: string, data: unknown) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseEvent(type, data)));
        } catch {
          closed = true;
        }
      }

      send("start", { total: items.length });

      for (let i = 0; i < items.length; i++) {
        if (isStopped()) break;
        const item = items[i];
        const progress = (stage: BulkItemProgress["stage"], error?: string) => {
          const p: BulkItemProgress = {
            index: i,
            url: item.url,
            keyword: item.keyword,
            stage,
            error,
          };
          send("progress", p);
        };

        try {
          progress("grounding");
          let grounding = null;
          try {
            grounding = await analyzeGrounding(item.keyword, item.url);
          } catch {
            // Gemini grounding is optional
          }

          if (isStopped()) break;
          progress("platforms");
          let platforms: PlatformResult[] = [];
          try {
            platforms = await scrapeAllPlatforms(item.keyword, item.url);
          } catch {
            // Platforms optional
          }

          if (isStopped()) break;
          progress("serp");
          let serp = null;
          try {
            serp = await fetchSerp(item.keyword, item.url);
          } catch {
            // SERP optional
          }

          if (isStopped()) break;
          progress("scraping");
          let targetPage = null;
          let competitorPages: ScrapedPage[] = [];
          try {
            targetPage = await scrapePage(item.url);
          } catch {
            // Target page scrape optional
          }

          if (!isStopped() && serp && serp.topCompetitors.length > 0) {
            try {
              competitorPages = await scrapePages(
                serp.topCompetitors.slice(0, 3),
              );
            } catch {
              // Competitor scrape optional
            }
          }

          if (isStopped()) break;
          progress("analyzing");
          let llmAnalysis = null;
          try {
            llmAnalysis = await analyzeSRO({
              targetUrl: item.url,
              keyword: item.keyword,
              grounding,
              platforms,
              serp,
              targetPage,
              competitorPages,
            });
          } catch {
            // LLM analysis optional
          }

          const result: BulkAnalysisResult = {
            index: i,
            input: item,
            grounding,
            platforms,
            serp,
            targetPage,
            competitorPages,
            llmAnalysis,
            timestamp: new Date().toISOString(),
          };

          progress("done");
          send("result", result);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          progress("error", msg);
        }
      }

      if (!isStopped())
        send("complete", { total: items.length });
      if (!closed) {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
