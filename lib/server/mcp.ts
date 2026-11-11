import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  AI_SCRAPER_PROVIDERS,
  getDatasetId,
  runAiScraper,
  type AiScraperProvider,
} from "./brightdata-scraper";
import { fetchSerp } from "./serp";
import { withTimeout } from "./http";
import type { SerpResult } from "./sro-types";
import { calcVisibilityScore, detectSentiment, findMentions } from "../scoring";

export const MCP_SERVER_VERSION = "1.7.0";

const ENGINE_LABELS: Record<AiScraperProvider, string> = {
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
  google_ai: "Google AI Mode",
};

// Known outages from https://docs.brightdata.com/release-notes. Shown by
// list_engines and attached to errors so an agent can tell an outage from a bug.
const ENGINE_NOTES: Partial<Record<AiScraperProvider, string>> = {
  perplexity:
    "Bright Data listed the Perplexity scraper as temporarily unavailable on 2026-11-10. Runs may fail until it is restored.",
};

const RETIRED_ENGINES = [
  {
    id: "copilot",
    label: "Microsoft Copilot",
    reason: "Bright Data no longer runs a Copilot scraper.",
  },
  {
    id: "grok",
    label: "Grok",
    reason:
      "Bright Data lists its Grok scraper as unavailable since 2026-06-14.",
  },
];

type ScrapeFn = (req: {
  provider: AiScraperProvider;
  prompt: string;
  country?: string;
}) => Promise<{ answer: string; sources: string[]; cached: boolean }>;

export interface McpDeps {
  scrape: ScrapeFn;
  serp: (keyword: string, targetUrl: string) => Promise<SerpResult>;
  /** Runs the AEO page audit and returns the report, or throws. */
  audit: (url: string) => Promise<unknown>;
  datasetId: (provider: AiScraperProvider) => string;
  /** Per-engine deadline for check_visibility. Defaults to engineTimeoutFromEnv(). */
  engineTimeoutMs?: number;
}

// Bright Data can poll a stuck snapshot for ~10 minutes (an engine outage looks
// like this). Cap each engine so the others still come back inside the route's
// 300s maxDuration.
export const ENGINE_TIMEOUT_MS = 240_000;

/** MCP_ENGINE_TIMEOUT_MS, clamped to 10s-900s. Above 280s only off Vercel. */
export function engineTimeoutFromEnv(): number {
  const n = Number(process.env.MCP_ENGINE_TIMEOUT_MS);
  if (!Number.isFinite(n) || n <= 0) return ENGINE_TIMEOUT_MS;
  return Math.min(900_000, Math.max(10_000, Math.round(n)));
}

export const defaultMcpDeps: Omit<McpDeps, "audit"> = {
  scrape: (req) => runAiScraper({ ...req, requireSources: true }),
  serp: fetchSerp,
  datasetId: getDatasetId,
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

function hostOf(url: string): string {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return "";
  }
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
    async () =>
      json({
        engines: AI_SCRAPER_PROVIDERS.map((id) => ({
          id,
          label: ENGINE_LABELS[id],
          datasetId: deps.datasetId(id),
          ...(ENGINE_NOTES[id] ? { note: ENGINE_NOTES[id] } : {}),
        })),
        retired: RETIRED_ENGINES,
        outages: "https://docs.brightdata.com/release-notes",
      }),
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
      const engines = [...new Set(args.engines ?? AI_SCRAPER_PROVIDERS)];
      const brandTerms = [args.brand, ...(args.aliases ?? [])]
        .map((t) => t.trim())
        .filter(Boolean);
      const competitorTerms = (args.competitors ?? [])
        .map((t) => t.trim())
        .filter(Boolean);
      const websites = args.websites ?? [];
      const siteHosts = websites.map(hostOf).filter(Boolean);

      // Progress notifications let a client that sent a progressToken show
      // engines finishing, and reset its request timeout on each one.
      const progressToken = extra._meta?.progressToken;
      let done = 0;
      const reportDone = async (provider: AiScraperProvider) => {
        done += 1;
        if (progressToken === undefined) return;
        await extra
          .sendNotification({
            method: "notifications/progress",
            params: {
              progressToken,
              progress: done,
              total: engines.length,
              message: `${ENGINE_LABELS[provider]} finished`,
            },
          })
          .catch(() => {});
      };

      const timeoutMs = deps.engineTimeoutMs ?? engineTimeoutFromEnv();
      const settled = await Promise.allSettled(
        engines.map((provider) =>
          withTimeout(
            deps.scrape({
              provider,
              prompt: args.prompt,
              country: args.country,
            }),
            timeoutMs,
            ENGINE_LABELS[provider],
          ).finally(() => reportDone(provider)),
        ),
      );

      const results = settled.map((s, i) => {
        const engine = engines[i];
        const label = ENGINE_LABELS[engine];
        if (s.status === "rejected") {
          return {
            engine,
            label,
            status: "error" as const,
            error: /timed out after/.test(errorMessage(s.reason))
              ? `${label} did not answer within ${Math.round(timeoutMs / 1000)}s. Bright Data's ${label} scraper is slow or down right now. Try again, or leave this engine out.`
              : errorMessage(s.reason),
            ...(ENGINE_NOTES[engine] ? { note: ENGINE_NOTES[engine] } : {}),
          };
        }
        const { answer, sources, cached } = s.value;
        if (!answer.trim()) {
          return {
            engine,
            label,
            status: "empty" as const,
            error: "Bright Data returned no answer text for this prompt.",
            ...(ENGINE_NOTES[engine] ? { note: ENGINE_NOTES[engine] } : {}),
          };
        }
        const citedSite = sources.filter((src) => {
          const h = hostOf(src);
          return siteHosts.some((d) => h === d || h.endsWith(`.${d}`));
        });
        return {
          engine,
          label,
          status: "ok" as const,
          visibilityScore: calcVisibilityScore(
            answer,
            sources,
            brandTerms,
            websites,
          ),
          sentiment: detectSentiment(answer, brandTerms),
          brandMentions: findMentions(answer, brandTerms),
          competitorMentions: findMentions(answer, competitorTerms),
          websiteCited: citedSite.length > 0,
          citedBrandUrls: citedSite,
          sourceCount: sources.length,
          sources: sources.slice(0, 25),
          answer: args.include_answer
            ? answer
            : answer.length > 600
              ? `${answer.slice(0, 600)}…`
              : answer,
          cached,
        };
      });

      const ok = results.filter((r) => r.status === "ok");
      const summary = {
        prompt: args.prompt,
        brand: args.brand,
        country: args.country ?? "US",
        enginesAnswered: ok.length,
        enginesFailed: results.length - ok.length,
        enginesMentioningBrand: ok
          .filter((r) => r.brandMentions.length > 0)
          .map((r) => r.engine),
        averageVisibility: ok.length
          ? Math.round(
              ok.reduce((sum, r) => sum + r.visibilityScore, 0) / ok.length,
            )
          : null,
      };

      if (ok.length === 0) {
        return {
          ...json({ summary, results }),
          isError: true,
        };
      }
      return json({ summary, results });
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
        let result = await deps.serp(keyword, target_url ?? "");
        // Bright Data now and then answers with a body that is not parsed
        // JSON; one retry clears it. Only a failed call is retried.
        if (result.totalResults === 0) {
          result = await deps.serp(keyword, target_url ?? "");
        }
        if (result.totalResults === 0) {
          return fail(
            "Google returned no organic results twice. If this keeps happening, check BRIGHT_DATA_KEY and that BRIGHT_DATA_SERP_ZONE names a SERP API zone on your account. The server log has the upstream error.",
          );
        }
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
