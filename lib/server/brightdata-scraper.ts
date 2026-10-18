import { z } from "zod";
import { fetchWithTimeout } from "./http";

const ProviderSchema = z.enum([
  "chatgpt",
  "perplexity",
  "copilot",
  "gemini",
  "google_ai",
]);

type Provider = z.infer<typeof ProviderSchema>;

const OUTPUT_CACHE_TTL_MS = 1000 * 60 * 20;

const inMemoryCache = new Map<
  string,
  { expiresAt: number; value: NormalizedScrapeResult }
>();

const providerToDatasetEnv: Record<Provider, string> = {
  chatgpt: "BRIGHT_DATA_DATASET_CHATGPT",
  perplexity: "BRIGHT_DATA_DATASET_PERPLEXITY",
  copilot: "BRIGHT_DATA_DATASET_COPILOT",
  gemini: "BRIGHT_DATA_DATASET_GEMINI",
  google_ai: "BRIGHT_DATA_DATASET_GOOGLE_AI",
};

// Bright Data's public AI-scraper dataset IDs. These are the same for every
// account, so nobody needs to set a dataset env var just to get started — the
// env vars stay as an override for anyone on a custom or private dataset.
// Every ID below was triggered live and returned a real answer on 2026-08-12.
const providerDefaultDataset: Record<Provider, string> = {
  chatgpt: "gd_m7aof0k82r803d5bjm",
  perplexity: "gd_m7dhdot1vw9a7gc1n",
  copilot: "gd_m7di5jy6s9geokz8w",
  gemini: "gd_mbz66arm2mf9cu856y",
  google_ai: "gd_mcswdt6z2elth3zqr2",
};

const providerBaseUrl: Record<Provider, string> = {
  chatgpt: "https://chatgpt.com/",
  perplexity: "https://www.perplexity.ai/",
  copilot: "https://copilot.microsoft.com/",
  gemini: "https://gemini.google.com/",
  google_ai: "https://www.google.com/",
};

type ScrapeRequest = {
  provider: Provider;
  prompt: string;
  requireSources?: boolean;
  country?: string;
};

type NormalizedScrapeResult = {
  provider: Provider;
  prompt: string;
  answer: string;
  sources: string[];
  snapshotId?: string;
  cached: boolean;
  raw: unknown;
  createdAt: string;
};

function getApiKey() {
  return process.env.BRIGHT_DATA_KEY;
}

function getDatasetId(provider: Provider) {
  return (
    process.env[providerToDatasetEnv[provider]] ||
    providerDefaultDataset[provider]
  );
}

function buildCacheKey(input: ScrapeRequest) {
  return JSON.stringify(input);
}

function withAuthHeaders() {
  const key = getApiKey();
  if (!key) {
    throw new Error("Missing BRIGHT_DATA_KEY");
  }

  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function stripAnswerHtml(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stripAnswerHtml(entry));
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const cleaned: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(obj)) {
      if (key.toLowerCase() === "answer_html") {
        continue;
      }
      cleaned[key] = stripAnswerHtml(entry);
    }

    return cleaned;
  }

  return value;
}

function extractSourcesFromAnswer(answer: string) {
  const found = new Set<string>();

  const blockedHostFragments = [
    // AI platforms
    "chatgpt.com",
    "openai.com",
    "oaiusercontent.com",
    "perplexity.ai",
    "pplx.ai",
    "copilot.microsoft.com",
    "grok.com",
    "x.ai",
    "gemini.google.com",
    "bard.google.com",
    "google.com/ai",
    // CDN / asset hosts
    "cloudfront.net",
    "cdn.prod.website-files.com",
    "cdn.jsdelivr.net",
    "cdnjs.cloudflare.com",
    "unpkg.com",
    "fastly.net",
    "akamaihd.net",
    "cloudflare.com",
    "amazonaws.com",
    // Tracking / analytics / pixels
    "connect.facebook.net",
    "facebook.net",
    "google-analytics.com",
    "googletagmanager.com",
    "doubleclick.net",
    "googlesyndication.com",
    "googleadservices.com",
    "hotjar.com",
    "segment.io",
    "segment.com",
    "mixpanel.com",
    "amplitude.com",
    "sentry.io",
    // Namespace / spec URIs
    "w3.org",
    "schema.org",
    "xmlns.com",
  ];

  const assetPathPattern =
    /\.(js|css|map|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|eot|mp4|webm|mp3)(\?|$)/i;

  const junkPathFragments = [
    "/signals/",
    "/pixel",
    "/tracking",
    "/beacon",
    "/analytics",
    "/__",
    "/wp-content/uploads/",
    "/wp-includes/",
  ];

  const isThirdPartyCitation = (urlValue: string) => {
    try {
      const parsed = new URL(urlValue);
      const host = parsed.hostname.toLowerCase();
      const full = `${host}${parsed.pathname}`.toLowerCase();

      if (!(parsed.protocol === "http:" || parsed.protocol === "https:")) {
        return false;
      }

      if (
        blockedHostFragments.some(
          (entry) => host === entry || host.endsWith(`.${entry}`),
        )
      ) {
        return false;
      }

      if (assetPathPattern.test(parsed.pathname)) {
        return false;
      }

      if (junkPathFragments.some((frag) => full.includes(frag))) {
        return false;
      }

      if (
        parsed.pathname.includes("/_spa/") ||
        parsed.pathname.includes("/assets/") ||
        full.includes("static")
      ) {
        return false;
      }

      // Reject overly long query strings (tracking params, base64 images, etc.)
      if (parsed.search.length > 200) {
        return false;
      }

      // Reject data URIs or blob-like things that somehow parsed
      if (host === "" || host === "localhost") {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  };

  const normalize = (urlValue: string) => {
    try {
      const parsed = new URL(urlValue);
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return urlValue;
    }
  };

  const plainUrls = answer.match(/https?:\/\/[^\s)\]}"']+/g) ?? [];
  plainUrls
    .map((entry) => entry.replace(/[),.;:!?]+$/, ""))
    .filter(isThirdPartyCitation)
    .map(normalize)
    .forEach((entry) => found.add(entry));

  const markdownLinks = answer.match(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/g) ?? [];
  markdownLinks.forEach((entry) => {
    const urlMatch = entry.match(/\((https?:\/\/[^)]+)\)/);
    if (!urlMatch?.[1]) return;
    const candidate = urlMatch[1].replace(/[),.;:!?]+$/, "");
    if (isThirdPartyCitation(candidate)) {
      found.add(normalize(candidate));
    }
  });

  return [...found];
}

function normalizeAnswer(rawRecord: Record<string, unknown>) {
  // include_errors=true returns failed items as {input:{prompt}, error,
  // error_code}. Never turn those into an answer.
  if (rawRecord.error || rawRecord.error_code) {
    const detail = [rawRecord.error_code, rawRecord.error]
      .filter((v) => typeof v === "string" && v)
      .join(": ");
    throw new Error(
      `Bright Data returned an error record${detail ? ` (${detail})` : ""}`,
    );
  }

  const answerCandidates = [
    rawRecord.answer_text, // Bright Data primary field
    rawRecord.answer_text_markdown, // Markdown variant (Perplexity, Copilot)
    rawRecord.answer, // Legacy / fallback
    rawRecord.response_raw, // raw response fallback
    rawRecord.response,
    rawRecord.output,
    rawRecord.result,
    rawRecord.text,
    rawRecord.content,
  ];

  for (const item of answerCandidates) {
    if (typeof item === "string" && item.trim()) {
      return item.trim();
    }
  }

  // Deep extraction: look inside nested objects/arrays for text content
  function extractDeepText(obj: unknown, depth: number): string | null {
    if (depth > 3) return null;
    if (Array.isArray(obj)) {
      for (const entry of obj) {
        const found = extractDeepText(entry, depth + 1);
        if (found) return found;
      }
    }
    if (obj && typeof obj === "object") {
      const record = obj as Record<string, unknown>;
      // Check common text field names
      for (const key of [
        "answer_text",
        "answer_text_markdown",
        "answer",
        "response_raw",
        "response",
        "output",
        "result",
        "text",
        "content",
        "message",
        "body",
        "summary",
        "description",
      ]) {
        if (
          typeof record[key] === "string" &&
          (record[key] as string).trim().length > 20
        ) {
          return (record[key] as string).trim();
        }
      }
      // Recurse into any value except the echoed request input
      for (const [key, val] of Object.entries(record)) {
        if (key === "input") continue;
        const found = extractDeepText(val, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  const deepText = extractDeepText(rawRecord, 0);
  if (deepText) return deepText;

  throw new Error("Bright Data record has no answer field");
}

async function monitorUntilReady(snapshotId: string) {
  const maxAttempts = 60;
  const BASE_DELAY = 2000;
  const MAX_DELAY = 10000;
  let elapsed = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const monitorRes = await fetchWithTimeout(
      `https://api.brightdata.com/datasets/v3/progress/${snapshotId}`,
      {
        method: "GET",
        headers: withAuthHeaders(),
      },
      20_000,
    );

    if (!monitorRes.ok) {
      throw new Error(`Monitor failed (${monitorRes.status})`);
    }

    const monitorJson = (await monitorRes.json()) as {
      status: "starting" | "running" | "ready" | "failed";
    };

    if (monitorJson.status === "ready") {
      return;
    }

    if (monitorJson.status === "failed") {
      throw new Error("Snapshot failed");
    }

    // Exponential backoff: 2s → 4s → 8s → 10s (capped)
    const delay = Math.min(
      BASE_DELAY * Math.pow(2, Math.floor(attempt / 5)),
      MAX_DELAY,
    );
    elapsed += delay;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw new Error(
    `Timed out after ~${Math.round(elapsed / 1000)}s waiting for snapshot ${snapshotId}`,
  );
}

async function downloadSnapshot(snapshotId: string) {
  const response = await fetchWithTimeout(
    `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`,
    {
      method: "GET",
      headers: withAuthHeaders(),
    },
    60_000,
  );

  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }

  return response.json();
}

export async function runAiScraper(
  request: ScrapeRequest,
): Promise<NormalizedScrapeResult> {
  const parsed = ProviderSchema.parse(request.provider);
  const datasetId = getDatasetId(parsed);

  // Only reachable if the env override is present but empty, since every
  // provider has a working default.
  if (!datasetId) {
    throw new Error(
      `${parsed} has no dataset ID. ${providerToDatasetEnv[parsed]} is set but empty — ` +
        `remove it to fall back to the public default, or paste a dataset ID from ` +
        `https://brightdata.com/cp/scrapers. The other engines run without it.`,
    );
  }

  const cacheKey = buildCacheKey(request);
  const cacheHit = inMemoryCache.get(cacheKey);
  if (cacheHit && cacheHit.expiresAt > Date.now()) {
    return {
      ...cacheHit.value,
      cached: true,
    };
  }

  const inputRecord: Record<string, unknown> = {
    url: providerBaseUrl[parsed],
    prompt: request.prompt,
    index: 1,
  };

  if (request.country) {
    inputRecord.country = request.country;
  }

  // Bright Data's synchronous endpoint gives up after ~60s and hands back a
  // snapshot_id to poll instead. Our own timeout must sit ABOVE that, or we
  // abort in the same instant Bright Data is answering and lose the handoff —
  // which is what made Gemini and Copilot (the two slowest engines) fail while
  // the faster ones passed.
  const scrapeResponse = await fetchWithTimeout(
    `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${datasetId}&notify=false&include_errors=true&format=json`,
    {
      method: "POST",
      headers: withAuthHeaders(),
      body: JSON.stringify({ input: [inputRecord] }),
    },
    90_000,
  );

  let payload: unknown;

  if (!scrapeResponse.ok && scrapeResponse.status !== 202) {
    const text = await scrapeResponse.text();
    throw new Error(`Scrape failed (${scrapeResponse.status}): ${text}`);
  }

  payload = await scrapeResponse.json();

  // The handoff arrives as 202, but also as a plain 200 whose body is a bare
  // {snapshot_id} object rather than the usual array of records. Detect it by
  // shape so either form is followed through to the poll.
  const pendingId =
    !Array.isArray(payload) &&
    payload &&
    typeof payload === "object" &&
    typeof (payload as { snapshot_id?: unknown }).snapshot_id === "string"
      ? (payload as { snapshot_id: string }).snapshot_id
      : null;

  if (pendingId) {
    await monitorUntilReady(pendingId);
    payload = await downloadSnapshot(pendingId);
  }

  // Keep unsanitized first record for structured source extraction
  const rawFirst = Array.isArray(payload)
    ? (payload as Record<string, unknown>[])[0]
    : (payload as Record<string, unknown>);
  const rawRecord = (rawFirst ?? {}) as Record<string, unknown>;

  const sanitizedPayload = stripAnswerHtml(payload);
  const sanitizedFirst = Array.isArray(sanitizedPayload)
    ? sanitizedPayload[0]
    : (sanitizedPayload as Record<string, unknown>);
  const record = (sanitizedFirst ?? {}) as Record<string, unknown>;
  const answer = normalizeAnswer(record);

  // Extract sources from answer text
  const textSources = extractSourcesFromAnswer(answer);

  // Also extract from Bright Data's structured citation fields
  const structuredSources: string[] = [];
  for (const field of ["citations", "links_attached", "sources"]) {
    const arr = rawRecord[field];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (typeof item === "string" && item.startsWith("http")) {
          structuredSources.push(item);
        } else if (item && typeof item === "object") {
          const url = (item as Record<string, unknown>).url;
          if (typeof url === "string" && url.startsWith("http")) {
            structuredSources.push(url);
          }
        }
      }
    }
  }

  // Merge and deduplicate
  const allSources = [...new Set([...textSources, ...structuredSources])];

  const normalized: NormalizedScrapeResult = {
    provider: parsed,
    prompt: request.prompt,
    answer,
    sources: allSources,
    snapshotId:
      typeof record.snapshot_id === "string" ? record.snapshot_id : undefined,
    cached: false,
    raw: sanitizedPayload,
    createdAt: new Date().toISOString(),
  };

  // Bound the cache: drop expired entries (and, if still oversized, the oldest)
  // so a long-lived process can't leak memory on high-cardinality prompts.
  if (inMemoryCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of inMemoryCache)
      if (v.expiresAt <= now) inMemoryCache.delete(k);
    while (inMemoryCache.size > 500) {
      const oldest = inMemoryCache.keys().next().value;
      if (oldest === undefined) break;
      inMemoryCache.delete(oldest);
    }
  }
  inMemoryCache.set(cacheKey, {
    expiresAt: Date.now() + OUTPUT_CACHE_TTL_MS,
    value: normalized,
  });

  return normalized;
}
