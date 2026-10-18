import type {
  GroundingResult,
  GroundingChunk as AppGroundingChunk,
  GroundingSupport,
} from "./sro-types";
import { withTimeout } from "./http";

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

  if (sourceDomain === targetDomain) return true;

  try {
    const source = new URL(sourceUrl);
    const target = new URL(targetUrl);
    if (
      source.hostname.replace(/^www\./, "") ===
      target.hostname.replace(/^www\./, "")
    ) {
      return true;
    }
  } catch {
    // fall through
  }

  return false;
}

export async function analyzeGrounding(
  keyword: string,
  targetUrl: string,
): Promise<GroundingResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set.");
  }

  // Dynamic import to avoid failing if the package isn't installed
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });

  const response = await withTimeout(
    ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: keyword,
      config: {
        tools: [{ googleSearch: {} }],
      },
    }),
    45_000,
    "gemini grounding",
  );

  const candidate = response.candidates?.[0];
  const metadata = candidate?.groundingMetadata;
  const answerText = response.text ?? "";

  const rawChunks = metadata?.groundingChunks ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chunks: AppGroundingChunk[] = (rawChunks as any[]).map((c) => ({
    uri: c?.web?.uri ?? "",
    title: c?.web?.title ?? "",
  }));

  const rawSupports = metadata?.groundingSupports ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supports: GroundingSupport[] = (rawSupports as any[]).map((s) => ({
    startIndex: s?.segment?.startIndex ?? 0,
    endIndex: s?.segment?.endIndex ?? 0,
    text: s?.segment?.text ?? "",
    chunkIndices: s?.groundingChunkIndices ?? [],
    confidenceScores: s?.confidenceScores ?? [],
  }));

  const searchQueries = (metadata?.webSearchQueries as string[]) ?? [];

  const targetDomain = extractDomain(targetUrl);
  const targetChunkIndices: number[] = [];
  chunks.forEach((chunk, idx) => {
    const titleDomain = chunk.title.replace(/^www\./, "").toLowerCase();
    if (
      urlMatchesTarget(chunk.uri, targetUrl) ||
      titleDomain === targetDomain ||
      titleDomain.endsWith(`.${targetDomain}`) ||
      targetDomain.endsWith(`.${titleDomain}`)
    ) {
      targetChunkIndices.push(idx);
    }
  });

  const targetUrlFound = targetChunkIndices.length > 0;

  const targetSnippets: string[] = [];
  for (const support of supports) {
    const refsTarget = support.chunkIndices.some((idx) =>
      targetChunkIndices.includes(idx),
    );
    if (refsTarget && support.text) {
      targetSnippets.push(support.text);
    }
  }

  const countWords = (text: string) => {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  };
  const totalGroundingWords = supports.reduce(
    (sum, s) => sum + countWords(s.text ?? ""),
    0,
  );
  const targetGroundingWords = targetSnippets.reduce(
    (sum, s) => sum + countWords(s),
    0,
  );

  const selectionRate =
    totalGroundingWords > 0 ? targetGroundingWords / totalGroundingWords : 0;

  return {
    query: keyword,
    answer: answerText,
    searchQueries,
    chunks,
    supports,
    targetUrlFound,
    targetUrlChunkIndices: targetChunkIndices,
    targetSnippets,
    totalGroundingWords,
    targetGroundingWords,
    selectionRate,
  };
}
