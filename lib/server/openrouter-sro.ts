import type {
  LLMAnalysisInput,
  LLMAnalysisResult,
  LLMRecommendation,
  GroundingResult,
  PlatformResult,
  SerpResult,
  ScrapedPage,
  SiteContext,
} from "./sro-types";
import { fetchWithTimeout } from "./http";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Gemini Flash is fast + reliable at structured JSON; overridable via env.
const MODEL = process.env.OPENROUTER_MODEL || "google/gemini-3.5-flash";
const MAX_USER_PROMPT_CHARS = 50_000;

const SYSTEM_PROMPT = `You are an expert SRO (Selection Rate Optimization) analyst. SRO is the discipline of optimizing web content to be selected by AI systems as grounding sources when answering user queries.

Key SRO concepts:

1. **Selection Rate**: The share of an AI system's grounding budget allocated to a particular source. When an AI answers a query, it draws from ~2,000 words of grounding content sourced from the web. Selection Rate measures what percentage of that budget comes from your page.

2. **Grounding Budget**: AI systems like Google's Gemini allocate approximately 2,000 words per query response as grounding material. Pages that capture a larger share of this budget have higher Selection Rates and greater influence on the AI's answer.

3. **Content characteristics that increase selection**:
   - Front-loaded sentences: Key facts and definitions placed early in content
   - Self-contained statements: Sentences that convey complete, standalone facts without requiring surrounding context
   - Factual density: Concrete data points, statistics, named entities, and specific claims
   - Direct answer patterns: Content structured to directly answer common questions
   - Structured markup: Proper headings, lists, tables, and schema that help AI parse content

4. **Cross-platform presence**: Being cited across multiple AI platforms (Google AI Mode, Gemini, ChatGPT, Perplexity, Copilot) signals authority. Pages cited by 4+ platforms are considered strong sources.

5. **SERP-AI correlation**: There is a strong correlation between organic search ranking and AI citation likelihood. Pages ranking in top 5 organic positions are significantly more likely to be used as grounding sources, but this is not absolute — authoritative niche content can outperform higher-ranked pages.

6. **Competitor analysis**: Understanding what content patterns competitors use when they are selected over you reveals specific gaps and opportunities.

Your task: Analyze all provided data and produce a JSON response with specific, actionable recommendations to improve the target URL's Selection Rate for the given keyword.

Respond ONLY with valid JSON matching this schema:
{
  "overallScore": <number 0-100>,
  "summary": "<string: 2-3 sentence executive summary>",
  "recommendations": [
    {
      "category": "<content|structure|technical|strategy>",
      "priority": "<high|medium|low>",
      "title": "<short title>",
      "description": "<detailed explanation>",
      "actionItems": ["<specific action 1>", "<specific action 2>"]
    }
  ],
  "contentGaps": ["<gap 1>", "<gap 2>"],
  "competitorInsights": ["<insight 1>", "<insight 2>"]
}`;

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "... [truncated]";
}

function formatGrounding(grounding: GroundingResult | null): string {
  if (!grounding) return "No Gemini grounding data available.";
  const srPercent = (grounding.selectionRate * 100).toFixed(1);
  const lines = [
    `Target URL found in grounding: ${grounding.targetUrlFound ? "YES" : "NO"}`,
    `Selection Rate: ${srPercent}%`,
    `Target word count: ${grounding.targetGroundingWords} of ${grounding.totalGroundingWords} total`,
    `Sources used: ${grounding.chunks.length}`,
    `Search queries (fanout): ${grounding.searchQueries.join(", ")}`,
  ];

  if (grounding.targetUrlChunkIndices.length > 0) {
    lines.push(
      `Target position(s) in grounding: ${grounding.targetUrlChunkIndices.map((i) => `#${i + 1}`).join(", ")}`,
    );
  }

  if (grounding.targetSnippets.length > 0) {
    lines.push("Grounding snippets attributed to target:");
    for (const s of grounding.targetSnippets.slice(0, 5)) {
      lines.push(`  - "${truncate(s, 300)}"`);
    }
  }

  if (grounding.chunks.length > 0) {
    lines.push("All grounding sources:");
    for (let i = 0; i < grounding.chunks.length; i++) {
      const chunk = grounding.chunks[i];
      const isTarget = grounding.targetUrlChunkIndices.includes(i);
      const chunkWords = grounding.supports
        .filter((s) => s.chunkIndices.includes(i))
        .reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
      lines.push(
        `  #${i + 1}: ${chunk.title} (${chunkWords}w)${isTarget ? " [TARGET]" : ""}`,
      );
    }
  }

  return lines.join("\n");
}

function formatPlatforms(platforms: PlatformResult[]): string {
  if (!platforms.length) return "No cross-platform data available.";
  const lines = ["Cross-platform AI citation results:"];
  for (const p of platforms) {
    if (p.status !== "done") {
      lines.push(`  ${p.label}: ${p.status}${p.error ? ` (${p.error})` : ""}`);
      continue;
    }
    const status = p.targetUrlCited ? "CITED" : "NOT CITED";
    lines.push(
      `  ${p.label}: ${status} (${p.citations.length} total citations)`,
    );
    if (p.targetCitations.length > 0) {
      for (const c of p.targetCitations.slice(0, 3)) {
        if (c.citedSentence) {
          lines.push(`    Cited sentence: "${truncate(c.citedSentence, 200)}"`);
        }
      }
    }
  }
  const doneCount = platforms.filter((p) => p.status === "done").length;
  const citedCount = platforms.filter((p) => p.targetUrlCited).length;
  lines.push(`\nCited on ${citedCount}/${doneCount} platforms.`);
  return lines.join("\n");
}

function formatSerp(serp: SerpResult | null): string {
  if (!serp) return "No SERP data available.";
  const lines = [
    `Target organic rank: ${serp.targetRank ?? "Not found in top results"}`,
    `Total organic results: ${serp.totalResults}`,
  ];
  if (serp.organicResults.length > 0) {
    lines.push("Top organic results:");
    for (const r of serp.organicResults.slice(0, 10)) {
      lines.push(
        `  #${r.position}: ${r.url} - "${truncate(r.title, 100)}"${r.isTarget ? " [TARGET]" : ""}`,
      );
    }
  }
  return lines.join("\n");
}

function formatPage(page: ScrapedPage | null, label: string): string {
  if (!page) return `${label}: No page data available.`;
  if (page.error) return `${label}: Error scraping - ${page.error}`;
  const lines = [`${label}: ${page.url}`];
  if (page.title) lines.push(`Title: ${page.title}`);
  if (page.metaDescription)
    lines.push(`Meta description: ${page.metaDescription}`);
  lines.push(`Word count: ${page.wordCount}`);
  if (page.headings.length > 0) {
    lines.push("Headings:");
    for (const h of page.headings.slice(0, 20)) {
      lines.push(`  - ${h}`);
    }
  }
  if (page.contentSnippet) {
    lines.push(`Content preview:\n${truncate(page.contentSnippet, 3000)}`);
  }
  return lines.join("\n");
}

function formatCompetitors(pages: ScrapedPage[]): string {
  if (!pages.length) return "No competitor page data available.";
  const budget = Math.floor(12000 / pages.length);
  const lines = ["Competitor page analysis:"];
  for (const p of pages.slice(0, 5)) {
    if (p.error) {
      lines.push(`\n--- ${p.url} --- Error: ${p.error}`);
      continue;
    }
    lines.push(`\n--- ${p.url} ---`);
    if (p.title) lines.push(`Title: ${p.title}`);
    lines.push(`Word count: ${p.wordCount}`);
    if (p.headings.length > 0) {
      lines.push("Headings:");
      for (const h of p.headings.slice(0, 10)) {
        lines.push(`  - ${h}`);
      }
    }
    if (p.contentSnippet) {
      lines.push(`Content preview:\n${truncate(p.contentSnippet, budget)}`);
    }
  }
  return lines.join("\n");
}

function formatSiteContext(ctx: SiteContext | null | undefined): string {
  if (!ctx) return "No site context available.";
  if (ctx.error) return `Site context error: ${ctx.error}`;
  const lines = [
    `Domain: ${ctx.domain}`,
    `Homepage: ${ctx.homepageUrl}`,
    `Industry: ${ctx.industry}`,
    `Target Audience: ${ctx.targetAudience}`,
    `Description: ${ctx.siteDescription}`,
  ];
  if (ctx.primaryTopics.length > 0) {
    lines.push(`Primary Topics: ${ctx.primaryTopics.join(", ")}`);
  }
  if (ctx.contentThemes.length > 0) {
    lines.push(`Content Themes: ${ctx.contentThemes.join(", ")}`);
  }
  return lines.join("\n");
}

function buildUserPrompt(input: LLMAnalysisInput): string {
  const sections = [
    `=== SRO ANALYSIS REQUEST ===`,
    `Target URL: ${input.targetUrl}`,
    `Target Keyword: ${input.keyword}`,
    ``,
    `=== SITE CONTEXT (Homepage Analysis) ===`,
    formatSiteContext(input.siteContext),
    ``,
    `=== GEMINI GROUNDING DATA ===`,
    formatGrounding(input.grounding),
    ``,
    `=== CROSS-PLATFORM AI CITATIONS ===`,
    formatPlatforms(input.platforms),
    ``,
    `=== ORGANIC SERP DATA ===`,
    formatSerp(input.serp),
    ``,
    `=== TARGET PAGE CONTENT ===`,
    formatPage(input.targetPage, "Target Page"),
    ``,
    `=== COMPETITOR PAGES ===`,
    formatCompetitors(input.competitorPages),
    ``,
    `Analyze all data above and provide specific, actionable SRO recommendations. Focus on what changes to the target page would increase its Selection Rate for the keyword "${input.keyword}".`,
  ];

  let prompt = sections.join("\n");
  if (prompt.length > MAX_USER_PROMPT_CHARS) {
    prompt =
      prompt.slice(0, MAX_USER_PROMPT_CHARS) +
      "\n\n[Content truncated to fit context limits. Analyze what is available.]";
  }
  return prompt;
}

function defaultResult(error: string): LLMAnalysisResult {
  return {
    overallScore: 0,
    summary: `Analysis could not be completed: ${error}`,
    recommendations: [
      {
        category: "strategy",
        priority: "high",
        title: "Retry Analysis",
        description: `The LLM analysis failed: ${error}. Please retry or check your configuration.`,
        actionItems: [
          "Verify OPENROUTER_KEY is set correctly",
          "Check network connectivity",
          "Retry the analysis",
        ],
      },
    ],
    contentGaps: [],
    competitorInsights: [],
  };
}

function parseResponse(raw: unknown): LLMAnalysisResult {
  const data = raw as Record<string, unknown>;

  const overallScore = Math.max(
    0,
    Math.min(100, Number(data.overallScore) || 0),
  );
  const summary =
    typeof data.summary === "string" ? data.summary : "No summary provided.";

  const recommendations: LLMRecommendation[] = [];
  if (Array.isArray(data.recommendations)) {
    for (const r of data.recommendations) {
      const rec = r as Record<string, unknown>;
      const category = [
        "content",
        "structure",
        "technical",
        "strategy",
      ].includes(rec.category as string)
        ? (rec.category as LLMRecommendation["category"])
        : "strategy";
      const priority = ["high", "medium", "low"].includes(
        rec.priority as string,
      )
        ? (rec.priority as LLMRecommendation["priority"])
        : "medium";
      recommendations.push({
        category,
        priority,
        title: typeof rec.title === "string" ? rec.title : "Untitled",
        description: typeof rec.description === "string" ? rec.description : "",
        actionItems: Array.isArray(rec.actionItems)
          ? rec.actionItems.filter((i: unknown) => typeof i === "string")
          : [],
      });
    }
  }

  const contentGaps = Array.isArray(data.contentGaps)
    ? data.contentGaps.filter((g: unknown) => typeof g === "string")
    : [];
  const competitorInsights = Array.isArray(data.competitorInsights)
    ? data.competitorInsights.filter((i: unknown) => typeof i === "string")
    : [];

  return {
    overallScore,
    summary,
    recommendations,
    contentGaps,
    competitorInsights,
  };
}

export async function analyzeSRO(
  input: LLMAnalysisInput,
): Promise<LLMAnalysisResult> {
  const apiKey = process.env.OPENROUTER_KEY;
  if (!apiKey) {
    return defaultResult("OPENROUTER_KEY environment variable is not set.");
  }

  const userPrompt = buildUserPrompt(input);

  try {
    const response = await fetchWithTimeout(
      OPENROUTER_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3,
          response_format: { type: "json_object" },
        }),
      },
      90_000,
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error(
        `[openrouter-sro] OpenRouter returned ${response.status}: ${errorText.slice(0, 500)}`,
      );
      return defaultResult(`OpenRouter API returned ${response.status}.`);
    }

    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content;

    if (typeof content !== "string") {
      return defaultResult("No content in OpenRouter response.");
    }

    const parsed = JSON.parse(content);
    return parseResponse(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return defaultResult(message);
  }
}
