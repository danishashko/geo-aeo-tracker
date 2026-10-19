import type {
  PlatformConfig,
  PlatformResult,
  PlatformCitation,
  BrightDataSnapshotRecord,
  BrightDataCitation,
} from "./sro-types";
import { fetchWithTimeout } from "./http";

const TRIGGER_URL = "https://api.brightdata.com/datasets/v3/trigger";
const SNAPSHOT_URL = "https://api.brightdata.com/datasets/v3/snapshot";

const POLL_INTERVAL = 6_000;
const MAX_POLLS = 50;

export const PLATFORMS: PlatformConfig[] = [
  {
    id: "ai_mode",
    label: "Google AI Mode",
    datasetEnvVar: "BRIGHT_DATA_DATASET_GOOGLE_AI",
    targetUrl: "https://www.google.com/search?udm=50",
    defaultDatasetId: "gd_mcswdt6z2elth3zqr2",
  },
  {
    id: "gemini",
    label: "Gemini",
    datasetEnvVar: "BRIGHT_DATA_DATASET_GEMINI",
    targetUrl: "https://gemini.google.com",
    defaultDatasetId: "gd_mbz66arm2mf9cu856y",
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    datasetEnvVar: "BRIGHT_DATA_DATASET_CHATGPT",
    targetUrl: "https://chatgpt.com",
    defaultDatasetId: "gd_m7aof0k82r803d5bjm",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    datasetEnvVar: "BRIGHT_DATA_DATASET_PERPLEXITY",
    targetUrl: "https://www.perplexity.ai",
    defaultDatasetId: "gd_m7dhdot1vw9a7gc1n",
  },
  {
    id: "copilot",
    label: "Copilot",
    datasetEnvVar: "BRIGHT_DATA_DATASET_COPILOT",
    targetUrl: "https://copilot.microsoft.com",
    defaultDatasetId: "gd_m7di5jy6s9geokz8w",
  },
];

function getApiKey(): string {
  return process.env.BRIGHT_DATA_KEY ?? "";
}

function getDatasetId(platform: PlatformConfig): string {
  return process.env[platform.datasetEnvVar] || platform.defaultDatasetId;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function urlMatchesTarget(sourceUrl: string, targetUrl: string): boolean {
  const sourceDomain = extractDomain(sourceUrl);
  const targetDomain = extractDomain(targetUrl);
  if (!sourceDomain || !targetDomain) return false;
  return sourceDomain === targetDomain;
}

function parseTextFragment(url: string): string {
  if (!url.includes("#:~:text=")) return "";
  const fragment = url.split("#:~:text=")[1].split("&")[0];
  const decoded = decodeURIComponent(fragment.replace(/\+/g, " "));
  const parts = decoded.split(",");
  const textParts: string[] = [];
  let i = 0;
  if (parts[0]?.endsWith("-")) i = 1;
  for (let j = i; j < parts.length; j++) {
    if (!parts[j].startsWith("-")) {
      textParts.push(parts[j]);
    }
  }
  return textParts.join(" ... ").trim();
}

function parseCitations(
  rawCitations: BrightDataCitation[],
  targetUrl: string,
): { all: PlatformCitation[]; target: PlatformCitation[] } {
  const all: PlatformCitation[] = [];
  const target: PlatformCitation[] = [];

  for (const cite of rawCitations) {
    const rawUrl = String(cite.url ?? "");
    const hasTextFragment = rawUrl.includes("#:~:text=");
    const citedSentence = parseTextFragment(rawUrl);

    let domain = cite.domain ?? "";
    if (domain.startsWith("http")) {
      domain = extractDomain(domain);
    } else if (!domain.includes(".")) {
      domain = extractDomain(rawUrl);
    }

    const parsed: PlatformCitation = {
      url: rawUrl.split("#:~:text=")[0],
      domain,
      title: cite.title ?? "",
      description: cite.description ?? "",
      hasTextFragment,
      citedSentence,
    };

    all.push(parsed);

    if (urlMatchesTarget(rawUrl, targetUrl)) {
      target.push(parsed);
    }
  }

  return { all, target };
}

async function triggerSnapshot(
  platform: PlatformConfig,
  keyword: string,
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("BRIGHT_DATA_KEY is not configured.");

  const datasetId = getDatasetId(platform);
  const payload = [
    {
      url: platform.targetUrl,
      prompt: keyword,
      country: "US",
    },
  ];

  const resp = await fetchWithTimeout(
    `${TRIGGER_URL}?dataset_id=${datasetId}&include_errors=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    30_000,
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `Trigger failed for ${platform.id}: ${resp.status} ${text}`,
    );
  }

  const data = await resp.json();
  const snapshotId = data.snapshot_id || data.id;
  if (!snapshotId) {
    throw new Error(`No snapshot_id in response for ${platform.id}`);
  }
  return snapshotId;
}

async function pollSnapshot(
  snapshotId: string,
): Promise<BrightDataSnapshotRecord[]> {
  const apiKey = getApiKey();
  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));

    const resp = await fetchWithTimeout(
      `${SNAPSHOT_URL}/${snapshotId}?format=json`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
      20_000,
    );

    if (resp.status === 200) {
      const text = await resp.text();
      try {
        const data = JSON.parse(text);
        if (Array.isArray(data)) return data;
        if (data.data && Array.isArray(data.data)) return data.data;
      } catch {
        // NDJSON fallback — parse line by line, skipping any malformed line so
        // one bad row can't throw out of the catch and crash the poll loop.
        const lines = text
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .reduce<BrightDataSnapshotRecord[]>((acc, l) => {
            try {
              acc.push(JSON.parse(l));
            } catch {
              /* skip malformed line */
            }
            return acc;
          }, []);
        if (lines.length > 0) return lines;
      }
    } else if (resp.status !== 202) {
      if (attempt > 5) {
        throw new Error(`Poll failed: HTTP ${resp.status}`);
      }
    }
  }
  throw new Error(`Snapshot ${snapshotId} timed out after ${MAX_POLLS} polls`);
}

export async function scrapePlatform(
  platform: PlatformConfig,
  keyword: string,
  targetUrl: string,
): Promise<PlatformResult> {
  try {
    const snapshotId = await triggerSnapshot(platform, keyword);
    const records = await pollSnapshot(snapshotId);

    if (!records.length) {
      return {
        platform: platform.id,
        label: platform.label,
        status: "error",
        answer: "",
        citations: [],
        targetUrlCited: false,
        targetCitations: [],
        error: "No records returned",
      };
    }

    const record = records[0];
    const answer = record.answer_text_markdown || record.answer_text || "";
    const rawCitations = record.citations || record.sources || [];
    const { all, target } = parseCitations(rawCitations, targetUrl);

    return {
      platform: platform.id,
      label: platform.label,
      status: "done",
      answer,
      citations: all,
      targetUrlCited: target.length > 0,
      targetCitations: target,
    };
  } catch (err) {
    return {
      platform: platform.id,
      label: platform.label,
      status: "error",
      answer: "",
      citations: [],
      targetUrlCited: false,
      targetCitations: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function scrapeAllPlatforms(
  keyword: string,
  targetUrl: string,
): Promise<PlatformResult[]> {
  // allSettled (not all): scrapePlatform already catches and returns an error
  // result, but this is defensive — one platform throwing must never discard
  // the others' completed results.
  const settled = await Promise.allSettled(
    PLATFORMS.map((p) => scrapePlatform(p, keyword, targetUrl)),
  );
  return settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : {
          platform: PLATFORMS[i].id,
          label: PLATFORMS[i].label,
          status: "error" as const,
          answer: "",
          citations: [],
          targetUrlCited: false,
          targetCitations: [],
          error:
            s.reason instanceof Error ? s.reason.message : String(s.reason),
        },
  );
}
