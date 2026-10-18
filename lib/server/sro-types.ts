// ─── Gemini Grounding Types ───────────────────────────────────────────────

export interface GroundingChunk {
  uri: string;
  title: string;
}

export interface GroundingSupport {
  startIndex: number;
  endIndex: number;
  text: string;
  chunkIndices: number[];
  confidenceScores: number[];
}

export interface GroundingResult {
  query: string;
  answer: string;
  searchQueries: string[];
  chunks: GroundingChunk[];
  supports: GroundingSupport[];
  targetUrlFound: boolean;
  targetUrlChunkIndices: number[];
  targetSnippets: string[];
  totalGroundingWords: number;
  targetGroundingWords: number;
  selectionRate: number;
}

// ─── Bright Data Platform Types ───────────────────────────────────────────

export type SROPlatform =
  | "ai_mode"
  | "gemini"
  | "chatgpt"
  | "perplexity"
  | "copilot";

export interface PlatformConfig {
  id: SROPlatform;
  label: string;
  datasetEnvVar: string;
  targetUrl: string;
  defaultDatasetId: string;
}

export interface PlatformCitation {
  url: string;
  domain: string;
  title: string;
  description: string;
  hasTextFragment: boolean;
  citedSentence: string;
}

export interface PlatformResult {
  platform: SROPlatform;
  label: string;
  status: "pending" | "processing" | "done" | "error";
  answer: string;
  citations: PlatformCitation[];
  targetUrlCited: boolean;
  targetCitations: PlatformCitation[];
  error?: string;
}

// ─── SERP Types ──────────────────────────────────────────────────────────

export interface SerpOrganicResult {
  position: number;
  url: string;
  domain: string;
  title: string;
  description: string;
  isTarget: boolean;
}

export interface SerpResult {
  keyword: string;
  totalResults: number;
  organicResults: SerpOrganicResult[];
  targetRank: number | null;
  topCompetitors: string[];
}

// ─── Web Unlocker Types ──────────────────────────────────────────────────

export interface ScrapedPage {
  url: string;
  domain: string;
  title: string;
  headings: string[];
  wordCount: number;
  contentSnippet: string;
  fullText: string;
  metaDescription: string;
  error?: string;
}

// ─── LLM Analysis Types ─────────────────────────────────────────────────

export interface SiteContext {
  domain: string;
  homepageUrl: string;
  primaryTopics: string[];
  industry: string;
  targetAudience: string;
  contentThemes: string[];
  siteDescription: string;
  error?: string;
}

export interface LLMAnalysisInput {
  targetUrl: string;
  keyword: string;
  grounding: GroundingResult | null;
  platforms: PlatformResult[];
  serp: SerpResult | null;
  targetPage: ScrapedPage | null;
  competitorPages: ScrapedPage[];
  siteContext?: SiteContext | null;
}

export interface LLMRecommendation {
  category: "content" | "structure" | "technical" | "strategy";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  actionItems: string[];
}

export interface LLMAnalysisResult {
  overallScore: number;
  summary: string;
  recommendations: LLMRecommendation[];
  contentGaps: string[];
  competitorInsights: string[];
}

// ─── Bulk Analysis Types ─────────────────────────────────────────────────

export interface AnalysisInput {
  url: string;
  keyword: string;
}

export type BulkItemStage =
  | "queued"
  | "grounding"
  | "platforms"
  | "serp"
  | "scraping"
  | "analyzing"
  | "done"
  | "error";

export interface BulkItemProgress {
  index: number;
  url: string;
  keyword: string;
  stage: BulkItemStage;
  error?: string;
}

export interface BulkAnalysisResult {
  index: number;
  input: AnalysisInput;
  grounding: GroundingResult | null;
  platforms: PlatformResult[];
  serp: SerpResult | null;
  targetPage: ScrapedPage | null;
  competitorPages: ScrapedPage[];
  llmAnalysis: LLMAnalysisResult | null;
  timestamp: string;
}

// ─── Bright Data Raw Types ───────────────────────────────────────────────

export interface BrightDataSnapshotRecord {
  input?: { prompt?: string };
  prompt?: string;
  answer_text?: string;
  answer_text_markdown?: string;
  citations?: BrightDataCitation[];
  sources?: BrightDataCitation[];
  links_attached?: { url: string }[];
  timestamp?: string;
  country?: string;
}

export interface BrightDataCitation {
  url?: string;
  domain?: string;
  title?: string;
  description?: string;
  cited?: boolean;
}

// ─── Rank Signal Types ───────────────────────────────────────────────────

export interface RankSignalTrial {
  passageHash: string;
  origin: "target" | "competitor";
  direction: "add" | "remove";
  featureSide: "A" | "B";
  outcome: "win" | "loss" | "invalid";
}

export interface RankSignalResult {
  runId: string;
  signalId: string;
  catalogVersion: number;
  judgeModel: string;
  rewriteModel: string;
  reasoningEffort: string;
  targetUrl: string;
  keyword: string;
  startedAt: string;
  finishedAt: string;
  trials: RankSignalTrial[];
  rejectedPairs: number;
  skipped: number;
  costUsd: number;
  endReason:
    | "verdict"
    | "max_trials"
    | "pool_exhausted"
    | "budget"
    | "aborted"
    | "error";
}

/** A built pair shown in the UI as a "synthetic test edit". Never published. */
export interface RankSignalExample {
  signalId: string;
  direction: "add" | "remove";
  with: string;
  without: string;
}
