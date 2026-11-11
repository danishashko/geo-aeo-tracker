import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  AI_SCRAPER_PROVIDERS,
  type AiScraperProvider,
} from "./brightdata-scraper";
import type { SerpResult } from "./sro-types";
import {
  ENGINE_LABELS,
  ENGINE_TIMEOUT_MS,
  checkVisibility,
  defaultDatasetId,
  defaultScrape,
  defaultSerp,
  listEngines,
  serpOrThrow,
  timeoutFromEnv,
  type ScrapeFn,
} from "./visibility";

export const MCP_SERVER_VERSION = "1.8.0";
export { ENGINE_TIMEOUT_MS };

export interface McpDeps {
  scrape: ScrapeFn;
  serp: (keyword: string, targetUrl: string) => Promise<SerpResult>;
  /** Runs the AEO page audit and returns the report, or throws. */
  audit: (url: string) => Promise<unknown>;
  datasetId: (provider: AiScraperProvider) => string;
  /** Per-engine deadline for check_visibility. Defaults to engineTimeoutFromEnv(). */
  engineTimeoutMs?: number;
}

/** MCP_ENGINE_TIMEOUT_MS, clamped to 10s-900s. Above 280s only off Vercel. */
export function engineTimeoutFromEnv(): number {
  return timeoutFromEnv(process.env.MCP_ENGINE_TIMEOUT_MS);
}

export const defaultMcpDeps: Omit<McpDeps, "audit"> = {
  scrape: defaultScrape,
  serp: defaultSerp,
  datasetId: defaultDatasetId,
};

function json(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function fail(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const EngineEnum = z.enum(AI_SCRAPER_PROVIDERS);
const Country = z
  .string()
  .regex(/^[A-Za-z]{2}$/, "Use a 2-letter country code, e.g. US or GB")
  .transform((c) => c.toUpperCase());

export function createMcpServer(deps: McpDeps): McpServer {
  const server = new McpServer(
    { name: "geo-aeo-tracker", version: MCP_SERVER_VERSION },
    {
      instructions:
        "GEO/AEO Tracker tools. check_visibility asks real AI engines (via Bright Data) a prompt and scores how visible a brand is in each answer. google_serp returns Google organic results. audit_page checks a page's AI-search readiness. check_visibility and google_serp bill the server owner's Bright Data account; call list_engines first, and run one prompt before batching many.",
    },
  );

  server.registerTool(
    "list_engines",
    {
      title: "List AI engines",
      description:
        "List the AI answer engines this server can query, with their Bright Data dataset IDs and any known outage. Free, makes no API call.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => json(listEngines(deps.datasetId)),
  );

  server.registerTool(
    "check_visibility",
    {
      title: "Check brand visibility in AI answers",
      description:
        "Ask one prompt to AI engines (ChatGPT, Perplexity, Gemini, Google AI Mode) through Bright Data and score the brand in each answer: visibility 0-100, sentiment, brand and competitor mentions, and whether the brand's website is cited. Engines run in parallel; slow engines take 30-90 seconds. Bills Bright Data once per engine.",
      inputSchema: {
        prompt: z
          .string()
          .min(3)
          .max(2000)
          .describe("The question a user would ask the AI engine"),
        brand: z.string().min(1).max(100).describe("Brand name to look for"),
        aliases: z
          .array(z.string().min(1).max(100))
          .max(10)
          .optional()
          .describe("Other names for the brand, e.g. product names"),
        competitors: z
          .array(z.string().min(1).max(100))
          .max(20)
          .optional()
          .describe("Competitor names to count in each answer"),
        websites: z
          .array(z.string().min(3).max(200))
          .max(5)
          .optional()
          .describe(
            "Brand domains or URLs. A cited source on these adds to the score",
          ),
        engines: z
          .array(EngineEnum)
          .min(1)
          .max(AI_SCRAPER_PROVIDERS.length)
          .optional()
          .describe("Engines to query. Defaults to all of them"),
        country: Country.optional().describe(
          "2-letter country to run the prompt from. Defaults to US",
        ),
        include_answer: z
          .boolean()
          .optional()
          .describe(
            "Return each full answer instead of a 600-character excerpt",
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args, extra) => {
      // Progress notifications let a client that sent a progressToken show
      // engines finishing, and reset its request timeout on each one.
      const progressToken = extra._meta?.progressToken;
      const report = await checkVisibility(
        {
          prompt: args.prompt,
          brand: args.brand,
          aliases: args.aliases,
          competitors: args.competitors,
          websites: args.websites,
          engines: args.engines,
          country: args.country,
          includeAnswer: args.include_answer,
        },
        {
          scrape: deps.scrape,
          timeoutMs: deps.engineTimeoutMs ?? engineTimeoutFromEnv(),
          onEngineDone: (engine, done, total) =>
            progressToken === undefined
              ? undefined
              : extra.sendNotification({
                  method: "notifications/progress",
                  params: {
                    progressToken,
                    progress: done,
                    total,
                    message: `${ENGINE_LABELS[engine]} finished`,
                  },
                }),
        },
      );
      return report.summary.enginesAnswered === 0
        ? { ...json(report), isError: true }
        : json(report);
    },
  );

  server.registerTool(
    "google_serp",
    {
      title: "Google organic results",
      description:
        "Google organic results (US) for a keyword through Bright Data's SERP API. Pass target_url to get that domain's rank. Bills Bright Data once.",
      inputSchema: {
        keyword: z.string().min(1).max(300),
        target_url: z
          .string()
          .max(500)
          .optional()
          .describe("Your page or domain; its rank comes back as targetRank"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("How many organic results to return. Default 10"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ keyword, target_url, limit }) => {
      try {
        const result = await serpOrThrow(deps.serp, keyword, target_url ?? "");
        return json({
          keyword: result.keyword,
          targetRank: target_url ? result.targetRank : undefined,
          totalResults: result.totalResults,
          organicResults: result.organicResults.slice(0, limit ?? 10),
        });
      } catch (err) {
        return fail(`SERP lookup failed: ${errorMessage(err)}`);
      }
    },
  );

  server.registerTool(
    "audit_page",
    {
      title: "AEO page audit",
      description:
        "Check one public page for AI-search readiness: llms.txt, AI crawler access in robots.txt, Schema.org, answer-first (BLUF) content, headings, sitemap and more. Returns a 0-100 score and each check. Fetches the page directly, no paid API.",
      inputSchema: {
        url: z.string().url().max(2000).describe("Public http(s) page URL"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ url }) => {
      try {
        return json(await deps.audit(url));
      } catch (err) {
        return fail(`Audit failed: ${errorMessage(err)}`);
      }
    },
  );

  return server;
}
