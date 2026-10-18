import type { ScrapedPage } from "./sro-types";
import { fetchWithTimeout } from "./http";

const API_URL = "https://api.brightdata.com/request";

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function extractTitleFromMarkdown(md: string): string {
  const match = md.match(/^#{1,6}\s+(.+)$/m);
  return match ? match[1].trim() : "";
}

function extractHeadingsFromMarkdown(md: string): string[] {
  const headings: string[] = [];
  const re = /^(#{1,3})\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const text = m[2].trim();
    if (text) headings.push(text);
  }
  return headings;
}

function countWords(md: string): number {
  const plain = md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`#>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.split(/\s+/).filter(Boolean).length;
}

function getContentSnippet(fullText: string, wordLimit = 500): string {
  const words = fullText.split(/\s+/);
  return words.slice(0, wordLimit).join(" ");
}

export async function scrapePage(url: string): Promise<ScrapedPage> {
  const apiKey = process.env.BRIGHT_DATA_KEY;
  if (!apiKey) {
    return {
      url,
      domain: extractDomain(url),
      title: "",
      headings: [],
      wordCount: 0,
      contentSnippet: "",
      fullText: "",
      metaDescription: "",
      error: "BRIGHT_DATA_KEY is not configured",
    };
  }

  const zone = process.env.BRIGHT_DATA_UNLOCKER_ZONE || "web_unlocker1";

  try {
    const response = await fetchWithTimeout(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        zone,
        url,
        format: "raw",
        data_format: "markdown",
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(
        `[unlocker] Bright Data ${response.status}: ${body.slice(0, 500)}`,
      );
      throw new Error(`Page fetch failed (HTTP ${response.status}).`);
    }

    const markdown = await response.text();

    return {
      url,
      domain: extractDomain(url),
      title: extractTitleFromMarkdown(markdown),
      headings: extractHeadingsFromMarkdown(markdown),
      wordCount: countWords(markdown),
      contentSnippet: getContentSnippet(markdown),
      fullText: markdown,
      metaDescription: "",
    };
  } catch (err) {
    return {
      url,
      domain: extractDomain(url),
      title: "",
      headings: [],
      wordCount: 0,
      contentSnippet: "",
      fullText: "",
      metaDescription: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function scrapePages(urls: string[]): Promise<ScrapedPage[]> {
  return Promise.all(urls.map((url) => scrapePage(url)));
}
