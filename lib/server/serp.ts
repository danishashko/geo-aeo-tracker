import type { SerpResult, SerpOrganicResult } from "./sro-types";
import { fetchWithTimeout } from "./http";

function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function emptyResult(keyword: string): SerpResult {
  return {
    keyword,
    totalResults: 0,
    organicResults: [],
    targetRank: null,
    topCompetitors: [],
  };
}

// Google now wraps result links in google.com/goto redirects. The site behind
// one is only in display_link ("https://brightdata.com › Blog › ...").
const GOOGLE_REDIRECT = /^https?:\/\/(www\.)?google\.[a-z.]+\/(goto|url)\b/i;

/** The result's real domain, or "" when Google hides it (e.g. Reddit threads). */
export function resultDomain(item: {
  link?: string;
  display_link?: string;
}): string {
  const link = item.link ?? "";
  if (!GOOGLE_REDIRECT.test(link)) return extractDomain(link);
  const shown = String(item.display_link ?? "")
    .split("›")[0]
    .trim();
  return /^https?:\/\//i.test(shown) ? extractDomain(shown) : "";
}

export function parseOrganic(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawOrganic: any[],
  targetDomain: string,
): Pick<SerpResult, "organicResults" | "targetRank" | "topCompetitors"> {
  let targetRank: number | null = null;
  const organicResults: SerpOrganicResult[] = [];
  const topCompetitors: string[] = [];

  for (const item of rawOrganic) {
    const url = item.link ?? "";
    const domain = resultDomain(item);
    const position = item.rank ?? item.global_rank ?? organicResults.length + 1;
    const isTarget = domain !== "" && domain === targetDomain;

    organicResults.push({
      position,
      url,
      domain,
      title: item.title ?? "",
      description: item.description ?? item.snippet ?? "",
      isTarget,
    });

    if (isTarget && targetRank === null) {
      targetRank = position;
    }

    if (!isTarget && topCompetitors.length < 5) {
      topCompetitors.push(url);
    }
  }
  return { organicResults, targetRank, topCompetitors };
}

export async function fetchSerp(
  keyword: string,
  targetUrl: string,
  // After a failed query Bright Data answers "try again after a minimum of 15
  // seconds", so the one retry waits that long.
  { retryDelayMs = 16_000 }: { retryDelayMs?: number } = {},
): Promise<SerpResult> {
  const apiKey = process.env.BRIGHT_DATA_KEY;
  // `serp_api1` is the name Bright Data's own docs use for a SERP zone, so it is
  // the likeliest to already exist on a fresh account. Override per-account with
  // BRIGHT_DATA_SERP_ZONE.
  const zone = process.env.BRIGHT_DATA_SERP_ZONE || "serp_api1";

  if (!apiKey) {
    console.error("[SERP] Missing BRIGHT_DATA_KEY");
    return emptyResult(keyword);
  }

  const targetDomain = extractDomain(targetUrl);
  const encodedQuery = encodeURIComponent(keyword);
  const googleUrl = `https://www.google.com/search?q=${encodedQuery}&gl=us&brd_json=1`;

  /** The organic list, or null when the body was not JSON (worth one retry). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestOnce = async (): Promise<any[] | null> => {
    const response = await fetchWithTimeout(
      "https://api.brightdata.com/request",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          zone,
          url: googleUrl,
          format: "json",
        }),
      },
      45_000,
    );

    if (!response.ok) {
      console.error(
        `[SERP] API error: ${response.status} ${response.statusText}`,
      );
      return [];
    }

    const data = await response.json();
    try {
      const body: { organic?: unknown[] } | undefined =
        typeof data.body === "string" ? JSON.parse(data.body) : data.body;
      return body?.organic ?? [];
    } catch {
      console.error(
        `[SERP] Body was not JSON: ${String(data.body ?? "").slice(0, 160) || "(empty)"}`,
      );
      return null;
    }
  };

  try {
    let rawOrganic = await requestOnce();
    if (rawOrganic === null) {
      await new Promise((r) => setTimeout(r, retryDelayMs));
      rawOrganic = (await requestOnce()) ?? [];
    }
    const parsed = parseOrganic(rawOrganic, targetDomain);
    return {
      keyword,
      totalResults: parsed.organicResults.length,
      ...parsed,
    };
  } catch (error) {
    console.error("[SERP] Fetch failed:", error);
    return emptyResult(keyword);
  }
}
