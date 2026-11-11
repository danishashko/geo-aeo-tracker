// Engine catalog and the visibility check, shared by the MCP server and the CLI.
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

export const ENGINE_LABELS: Record<AiScraperProvider, string> = {
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
  google_ai: "Google AI Mode",
};

// Known outages from https://docs.brightdata.com/release-notes. Listed with the
// engines and attached to errors so a reader can tell an outage from a bug.
export const ENGINE_NOTES: Partial<Record<AiScraperProvider, string>> = {
  perplexity:
    "Bright Data listed the Perplexity scraper as temporarily unavailable on 2026-11-10. Runs may fail until it is restored.",
};

export const RETIRED_ENGINES = [
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

export const OUTAGES_URL = "https://docs.brightdata.com/release-notes";

export type ScrapeFn = (req: {
  provider: AiScraperProvider;
  prompt: string;
  country?: string;
}) => Promise<{ answer: string; sources: string[]; cached: boolean }>;

export type SerpFn = (
  keyword: string,
  targetUrl: string,
) => Promise<SerpResult>;

export const defaultScrape: ScrapeFn = (req) =>
  runAiScraper({ ...req, requireSources: true });
export const defaultSerp: SerpFn = fetchSerp;
export const defaultDatasetId = getDatasetId;

// Bright Data can poll a stuck snapshot for ~10 minutes (an engine outage looks
// like this). Cap each engine so the others still come back inside the MCP
// route's 300s maxDuration.
export const ENGINE_TIMEOUT_MS = 240_000;

/** Reads a timeout in ms from an env value, clamped to 10s-900s. */
export function timeoutFromEnv(value: string | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return ENGINE_TIMEOUT_MS;
  return Math.min(900_000, Math.max(10_000, Math.round(n)));
}

export function listEngines(datasetId: (p: AiScraperProvider) => string) {
  return {
    engines: AI_SCRAPER_PROVIDERS.map((id) => ({
      id,
      label: ENGINE_LABELS[id],
      datasetId: datasetId(id),
      ...(ENGINE_NOTES[id] ? { note: ENGINE_NOTES[id] } : {}),
    })),
    retired: RETIRED_ENGINES,
    outages: OUTAGES_URL,
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function hostOf(url: string): string {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return "";
  }
}

export interface VisibilityInput {
  prompt: string;
  brand: string;
  aliases?: string[];
  competitors?: string[];
  websites?: string[];
  engines?: AiScraperProvider[];
  country?: string;
  /** Return each full answer instead of a 600-character excerpt. */
  includeAnswer?: boolean;
}

export interface VisibilityOptions {
  scrape: ScrapeFn;
  timeoutMs: number;
  /** Called as each engine finishes, in finishing order. */
  onEngineDone?: (
    engine: AiScraperProvider,
    done: number,
    total: number,
  ) => void | Promise<void>;
}

/** Asks every engine the prompt in parallel and scores the brand in each answer. */
export async function checkVisibility(
  input: VisibilityInput,
  { scrape, timeoutMs, onEngineDone }: VisibilityOptions,
) {
  const engines = [...new Set(input.engines ?? AI_SCRAPER_PROVIDERS)];
  const brandTerms = [input.brand, ...(input.aliases ?? [])]
    .map((t) => t.trim())
    .filter(Boolean);
  const competitorTerms = (input.competitors ?? [])
    .map((t) => t.trim())
    .filter(Boolean);
  const websites = input.websites ?? [];
  const siteHosts = websites.map(hostOf).filter(Boolean);

  let done = 0;
  const settled = await Promise.allSettled(
    engines.map((provider) =>
      withTimeout(
        scrape({ provider, prompt: input.prompt, country: input.country }),
        timeoutMs,
        ENGINE_LABELS[provider],
      ).finally(async () => {
        done += 1;
        await Promise.resolve(
          onEngineDone?.(provider, done, engines.length),
        ).catch(() => {});
      }),
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
      answer: input.includeAnswer
        ? answer
        : answer.length > 600
          ? `${answer.slice(0, 600)}…`
          : answer,
      cached,
    };
  });

  const ok = results.filter((r) => r.status === "ok");
  const summary = {
    prompt: input.prompt,
    brand: input.brand,
    country: input.country ?? "US",
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
  return { summary, results };
}

export type VisibilityReport = Awaited<ReturnType<typeof checkVisibility>>;

/** Google organic results, or a clear error when Google returned none. */
export async function serpOrThrow(
  serp: SerpFn,
  keyword: string,
  targetUrl: string,
): Promise<SerpResult> {
  const result = await serp(keyword, targetUrl);
  if (result.totalResults === 0) {
    throw new Error(
      "Google returned no organic results, also on a retry 16 seconds later. If this keeps happening, check BRIGHT_DATA_KEY and that BRIGHT_DATA_SERP_ZONE names a SERP API zone on your account.",
    );
  }
  return result;
}
