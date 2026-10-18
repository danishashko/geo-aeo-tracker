import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import {
  buildPassagePool,
  expandPool,
} from "@/lib/server/rank-signal-passages";
import {
  CATALOG_VERSION,
  RUN_ORDER,
  getSignal,
} from "@/lib/server/rank-signal-features";
import {
  PRICE_TABLE,
  allowedModels,
  judgeModelFromEnv,
  modelProblem,
  rewriteModelFromEnv,
} from "@/lib/server/rank-signal-judge";
import {
  MAX_RUN_USD,
  hourlyCapRemainingUsd,
  runSignal,
} from "@/lib/server/rank-signal";
import type { ScrapedPage } from "@/lib/server/sro-types";

export const runtime = "nodejs";
// One request runs one signal: ≤ 40 trials, well under this ceiling.
export const maxDuration = 300;

const pageSchema = z
  .object({ url: z.string().url(), fullText: z.string().max(200_000) })
  .passthrough();

const requestSchema = z.object({
  targetUrl: z.string().url(),
  keyword: z.string().min(1).max(200),
  signalId: z.string().regex(/^S\d{2}$/),
  targetPage: pageSchema,
  competitorPages: z.array(pageSchema).max(3).default([]),
  concurrency: z.number().int().min(1).max(6).default(4),
  budgetRemainingUsd: z.number().positive().max(5),
  judgeModel: z.string().max(100).optional(), // must be in the allowlist
  runId: z
    .string()
    .regex(/^[\w-]{1,64}$/)
    .optional(),
});

function sseEvent(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function toPage(p: z.infer<typeof pageSchema>): ScrapedPage {
  const rec = p as Record<string, unknown>;
  let domain = typeof rec.domain === "string" ? rec.domain : "";
  if (!domain) {
    try {
      domain = new URL(p.url).hostname;
    } catch {
      domain = p.url;
    }
  }
  return {
    url: p.url,
    domain,
    title: "",
    headings: [],
    wordCount: 0,
    contentSnippet: "",
    fullText: p.fullText,
    metaDescription: "",
    error: typeof rec.error === "string" && rec.error ? rec.error : undefined,
  };
}

/** Panel config: signal list, default models and the judge allowlist. */
export async function GET() {
  return Response.json({
    catalogVersion: CATALOG_VERSION,
    judgeModel: judgeModelFromEnv(),
    rewriteModel: rewriteModelFromEnv(),
    allowedModels: allowedModels().filter((m) => PRICE_TABLE[m]),
    maxRunUsd: MAX_RUN_USD,
    signals: RUN_ORDER.map((id) => {
      const s = getSignal(id)!;
      return { id: s.id, name: s.name, build: s.build };
    }),
  });
}

export async function POST(req: NextRequest) {
  // New in this route: no other /api route enforces the demo-only flag.
  if ((process.env.NEXT_PUBLIC_DEMO_ONLY ?? "").trim().toLowerCase() === "true")
    return jsonError(403, "Rank Signal is disabled in demo-only mode.");
  if (!process.env.OPENROUTER_KEY)
    return jsonError(503, "OPENROUTER_KEY is not configured.");

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await req.json());
  } catch (error) {
    return jsonError(
      400,
      error instanceof Error ? error.message : "Invalid request",
    );
  }

  const judgeModel = body.judgeModel ?? judgeModelFromEnv();
  const rewriteModel = rewriteModelFromEnv();
  for (const model of [judgeModel, rewriteModel]) {
    const problem = modelProblem(model);
    if (problem)
      return jsonError(
        400,
        `${problem} To change the rewriter model, set RANK_SIGNAL_REWRITE_MODEL (it falls back to OPENROUTER_MODEL).`,
      );
  }

  const hourlyRemaining = hourlyCapRemainingUsd();
  if (hourlyRemaining <= 0)
    return jsonError(
      429,
      "Rank Signal hourly spend cap reached. Try again later or raise RANK_SIGNAL_MAX_USD_PER_HOUR.",
    );

  if (!getSignal(body.signalId))
    return jsonError(400, `Unknown signal: ${body.signalId}`);

  const { passages: basePool } = buildPassagePool({
    keyword: body.keyword,
    targetPage: toPage(body.targetPage),
    competitorPages: body.competitorPages.map(toPage),
  });
  const budgetUsd = Math.min(
    body.budgetRemainingUsd,
    MAX_RUN_USD,
    hourlyRemaining,
  );

  const encoder = new TextEncoder();
  // One controller for both disconnect paths: req.signal and stream cancel.
  // It is passed to every OpenRouter call, so a disconnect aborts in-flight
  // requests instead of letting them finish and bill.
  const abort = new AbortController();
  const onAbort = () => abort.abort();
  req.signal.addEventListener("abort", onAbort);

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      function send(type: string, data: unknown) {
        if (closed || abort.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(sseEvent(type, data)));
        } catch {
          closed = true;
        }
      }

      try {
        // Pool under 40: top up from the SERP top 10 (cached per run).
        const { passages, added } = await expandPool(
          {
            keyword: body.keyword,
            targetUrl: body.targetUrl,
            passages: basePool,
            knownUrls: [body.targetPage.url, ...body.competitorPages.map((p) => p.url)],
          },
          { signal: abort.signal },
        );
        if (abort.signal.aborted) return;
        const result = await runSignal(
          {
            runId: body.runId ?? randomUUID(),
            signalId: body.signalId,
            keyword: body.keyword,
            targetUrl: body.targetUrl,
            passages,
            concurrency: body.concurrency,
            budgetUsd,
            judgeModel,
            rewriteModel,
            poolFromSerp: added,
          },
          send,
          abort.signal,
        );
        if (result) {
          const n = result.trials.filter((t) => t.outcome !== "invalid").length;
          const wins = result.trials.filter((t) => t.outcome === "win").length;
          console.info(
            `[rank-signal] ${result.signalId} end=${result.endReason} n=${n} wins=${wins} cost=$${result.costUsd.toFixed(4)}`,
          );
        }
      } catch (err) {
        send("error", {
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        req.signal.removeEventListener("abort", onAbort);
        if (!closed) {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }
    },
    cancel() {
      abort.abort();
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
