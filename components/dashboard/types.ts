export type Provider =
  | "chatgpt"
  | "perplexity"
  /** Legacy: Bright Data retired the Copilot scraper. Kept so saved runs still render. */
  | "copilot"
  | "gemini"
  | "google_ai";

export type ScrapeRun = {
  provider: Provider;
  prompt: string;
  answer: string;
  sources: string[];
  createdAt: string;
  /** 0-100 visibility score based on brand mention, position, sentiment */
  visibilityScore: number;
  /** Detected sentiment of the response toward the brand */
  sentiment: "positive" | "neutral" | "negative" | "not-mentioned";
  /** Brand names/aliases that were found in the answer */
  brandMentions: string[];
  /** Competitor names found in the answer */
  competitorMentions: string[];
  /** ISO country code the run was executed in (Bright Data geolocation) */
  country?: string;
};

/** Structured section inside a battlecard */
type BattlecardSection = {
  heading: string;
  points: string[];
};

export type Battlecard = {
  competitor: string;
  sentiment: "positive" | "neutral" | "negative";
  summary: string;
  /** Structured sections: strengths, weaknesses, pricing, AI visibility, etc. */
  sections?: BattlecardSection[];
};

export type AuditCheck = {
  id: string;
  label: string;
  category: "discovery" | "structure" | "content" | "technical" | "rendering";
  pass: boolean;
  value: string;
  detail: string;
};

export type AuditReport = {
  url: string;
  score: number;
  checks: AuditCheck[];
  /** Legacy fields kept for backward compat */
  llmsTxtPresent: boolean;
  schemaMentions: number;
  blufDensity: number;
  pass: {
    llmsTxt: boolean;
    schema: boolean;
    bluf: boolean;
  };
};

export type BrandConfig = {
  brandName: string;
  brandAliases: string;
  /** Multiple brand/company website URLs */
  websites: string[];
  industry: string;
  keywords: string;
  description: string;
};

/** Workspace for multi-brand tracking */
export type Workspace = {
  id: string;
  brandName: string;
  createdAt: string;
};

export const ALL_PROVIDERS: Provider[] = [
  "chatgpt",
  "perplexity",
  "gemini",
  "google_ai",
];

export const PROVIDER_LABELS: Record<Provider, string> = {
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  copilot: "Copilot",
  gemini: "Gemini",
  google_ai: "Google AI",
};

/** Countries available for geo-scoped AI-visibility tracking (Bright Data geolocation, 2-letter codes) */
export const COUNTRIES: { code: string; label: string }[] = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" },
  { code: "NL", label: "Netherlands" },
  { code: "BR", label: "Brazil" },
  { code: "IN", label: "India" },
  { code: "JP", label: "Japan" },
  { code: "MX", label: "Mexico" },
];

export const COUNTRY_LABELS: Record<string, string> = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c.label]),
);

/** A drift alert generated when visibility changes significantly between auto-runs */
export type DriftAlert = {
  id: string;
  prompt: string;
  provider: Provider;
  oldScore: number;
  newScore: number;
  delta: number;
  createdAt: string;
  dismissed: boolean;
};

/** Schedule interval value in milliseconds */
export type ScheduleInterval = 3600000 | 21600000 | 43200000 | 86400000;

export const SCHEDULE_OPTIONS: {
  value: ScheduleInterval;
  label: string;
  desc: string;
}[] = [
  { value: 3600000, label: "Every Hour", desc: "Run once per hour" },
  { value: 21600000, label: "Every 6 Hours", desc: "Run 4× per day" },
  { value: 43200000, label: "Every 12 Hours", desc: "Run 2× per day" },
  { value: 86400000, label: "Daily", desc: "Once per day" },
];

/** Computed delta for a prompt+provider pair between runs */
export type RunDelta = {
  prompt: string;
  provider: Provider;
  currentScore: number;
  previousScore: number;
  delta: number;
  currentRun: ScrapeRun;
  previousRun: ScrapeRun;
};

/** Structured competitor with optional aliases and websites */
export type Competitor = {
  name: string;
  aliases: string[];
  websites: string[];
};

/** A tracking prompt with optional tags for grouping/filtering */
export type TaggedPrompt = {
  text: string;
  tags: string[];
};

export type AppState = {
  brand: BrandConfig;
  provider: Provider;
  /** Multiple providers selected for parallel runs */
  activeProviders: Provider[];
  /** Active country (2-letter code) for geo-scoped AI-visibility tracking */
  country: string;
  prompt: string;
  customPrompts: TaggedPrompt[];
  personas: string;
  fanoutPrompts: string[];
  niche: string;
  nicheQueries: string[];
  cronExpr: string;
  githubWorkflow: string;
  competitors: Competitor[];
  battlecards: Battlecard[];
  runs: ScrapeRun[];
  auditUrl: string;
  auditReport: AuditReport | null;
  /** In-app scheduling */
  scheduleEnabled: boolean;
  scheduleIntervalMs: ScheduleInterval;
  lastScheduledRun: string | null;
  /** Drift alerts from auto-runs */
  driftAlerts: DriftAlert[];
};

export const tabs = [
  "Project Settings",
  "Prompt Hub",
  "Persona Fan-Out",
  "Niche Explorer",
  "Responses",
  "Visibility Analytics",
  "Citations",
  "Citation Opportunities",
  "Competitor Battlecards",
  "AEO Audit",
  "SRO Analysis",
  "Automation",
  "Documentation",
] as const;

export type TabKey = (typeof tabs)[number];
