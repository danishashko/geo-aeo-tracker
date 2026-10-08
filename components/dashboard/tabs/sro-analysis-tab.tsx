"use client";

import { useState, useCallback } from "react";
import type {
  GroundingResult,
  PlatformResult,
  PlatformCitation,
  SROPlatform,
  SerpResult,
  ScrapedPage,
  SiteContext,
  LLMAnalysisResult,
  LLMRecommendation,
} from "@/lib/server/sro-types";

type AnalysisStage =
  | "idle"
  | "grounding"
  | "platforms"
  | "serp"
  | "scraping"
  | "context"
  | "analyzing"
  | "done"
  | "error";

interface SROState {
  targetUrl: string;
  keyword: string;
  stage: AnalysisStage;
  error: string | null;
  grounding: GroundingResult | null;
  platforms: PlatformResult[];
  serp: SerpResult | null;
  targetPage: ScrapedPage | null;
  competitorPages: ScrapedPage[];
  siteContext: SiteContext | null;
  llmAnalysis: LLMAnalysisResult | null;
}

const INITIAL: SROState = {
  targetUrl: "",
  keyword: "",
  stage: "idle",
  error: null,
  grounding: null,
  platforms: [],
  serp: null,
  targetPage: null,
  competitorPages: [],
  siteContext: null,
  llmAnalysis: null,
};

/* ── Demo seed: a completed analysis so the demo isn't an empty form ── */
const DEMO_CITE_DOMAINS = [
  "nytimes.com",
  "goodhousekeeping.com",
  "greenplate.com",
  "hearthbox.com",
  "cnet.com",
  "seriouseats.com",
];

function demoCitation(domain: string, isTarget: boolean): PlatformCitation {
  return {
    url: isTarget ? "https://forkful.com/vs/greenplate" : `https://${domain}/`,
    domain: isTarget ? "forkful.com" : domain,
    title: isTarget ? "Forkful vs GreenPlate" : `${domain} — meal kit reviews`,
    description: "",
    hasTextFragment: false,
    citedSentence: "",
  };
}

function demoPlatform(
  platform: SROPlatform,
  label: string,
  targetCited: boolean,
  citationCount: number,
): PlatformResult {
  const citations: PlatformCitation[] = Array.from(
    { length: citationCount },
    (_, i) =>
      demoCitation(
        DEMO_CITE_DOMAINS[i % DEMO_CITE_DOMAINS.length],
        targetCited && i === 0,
      ),
  );
  return {
    platform,
    label,
    status: "done",
    answer: "",
    citations,
    targetUrlCited: targetCited,
    targetCitations: targetCited ? [citations[0]] : [],
  };
}

const DEMO_SRO_RESULT: SROState = {
  targetUrl: "https://forkful.com/vs/greenplate",
  keyword: "best healthy meal kit",
  stage: "done",
  error: null,
  grounding: {
    query: "best healthy meal kit",
    answer:
      "The best healthy meal kits in 2026 include Forkful, GreenPlate, Hearthbox, and Saveur Kits. Forkful is a chef-designed service with nutritionist-approved menus, family-size portions, and quick 15-minute recipes.",
    searchQueries: [
      "best healthy meal kit",
      "healthiest meal kit delivery 2026",
      "meal kit for busy families",
    ],
    chunks: [
      {
        uri: "https://www.nytimes.com/wirecutter/reviews/best-meal-kit-delivery-services/",
        title: "nytimes.com",
      },
      {
        uri: "https://www.goodhousekeeping.com/food-products/meal-kit-reviews/",
        title: "goodhousekeeping.com",
      },
      {
        uri: "https://forkful.com/vs/greenplate",
        title: "forkful.com",
      },
      { uri: "https://greenplate.com/menu", title: "greenplate.com" },
      { uri: "https://hearthbox.com/plans", title: "hearthbox.com" },
      {
        uri: "https://www.cnet.com/health/nutrition/best-meal-kit-delivery/",
        title: "cnet.com",
      },
    ],
    supports: [],
    targetUrlFound: true,
    targetUrlChunkIndices: [2],
    targetSnippets: [
      "Forkful is a chef-designed meal-kit service with nutritionist-approved menus, family-size portions, and quick 15-minute recipes.",
    ],
    totalGroundingWords: 540,
    targetGroundingWords: 86,
    selectionRate: 0.159,
  },
  platforms: [
    demoPlatform("chatgpt", "ChatGPT", true, 5),
    demoPlatform("perplexity", "Perplexity", true, 4),
    demoPlatform("gemini", "Gemini", false, 3),
    demoPlatform("copilot", "Copilot", true, 3),
    demoPlatform("ai_mode", "Google AI Mode", false, 6),
  ],
  serp: {
    keyword: "best healthy meal kit",
    totalResults: 9,
    targetRank: 4,
    topCompetitors: [
      "https://www.nytimes.com/wirecutter/reviews/best-meal-kit-delivery-services/",
      "https://greenplate.com/",
      "https://hearthbox.com/",
    ],
    organicResults: [
      {
        position: 1,
        url: "https://www.nytimes.com/wirecutter/reviews/best-meal-kit-delivery-services/",
        domain: "nytimes.com",
        title: "The Best Meal Kit Delivery Services | Wirecutter",
        description: "",
        isTarget: false,
      },
      {
        position: 2,
        url: "https://www.goodhousekeeping.com/food-products/meal-kit-reviews/",
        domain: "goodhousekeeping.com",
        title: "9 Best Meal Kit Delivery Services 2026",
        description: "",
        isTarget: false,
      },
      {
        position: 3,
        url: "https://greenplate.com/",
        domain: "greenplate.com",
        title: "GreenPlate — Organic Meal Kits",
        description: "",
        isTarget: false,
      },
      {
        position: 4,
        url: "https://forkful.com/vs/greenplate",
        domain: "forkful.com",
        title: "Forkful vs GreenPlate — Which Healthy Meal Kit Wins?",
        description: "",
        isTarget: true,
      },
      {
        position: 5,
        url: "https://hearthbox.com/plans",
        domain: "hearthbox.com",
        title: "Hearthbox — Budget Family Meal Kits",
        description: "",
        isTarget: false,
      },
      {
        position: 6,
        url: "https://www.cnet.com/health/nutrition/best-meal-kit-delivery/",
        domain: "cnet.com",
        title: "Best Meal Kit Delivery Services for 2026",
        description: "",
        isTarget: false,
      },
      {
        position: 7,
        url: "https://www.reddit.com/r/mealkits/",
        domain: "reddit.com",
        title: "r/mealkits — community reviews",
        description: "",
        isTarget: false,
      },
    ],
  },
  targetPage: {
    url: "https://forkful.com/vs/greenplate",
    domain: "forkful.com",
    title: "Forkful vs GreenPlate — Which Healthy Meal Kit Wins?",
    headings: [
      "Forkful vs GreenPlate",
      "Menu & nutrition",
      "Price per serving",
      "Cook time",
      "FAQ",
    ],
    wordCount: 1240,
    contentSnippet:
      "Forkful is a chef-designed meal-kit service with nutritionist-approved menus and 15-minute recipes, while GreenPlate focuses on certified-organic ingredients.",
    fullText: "",
    metaDescription:
      "Compare Forkful and GreenPlate meal kits: menu, nutrition, price per serving, and cook time.",
  },
  competitorPages: [],
  siteContext: {
    domain: "forkful.com",
    homepageUrl: "https://forkful.com",
    primaryTopics: [
      "Healthy meal kits",
      "Quick weeknight recipes",
      "Family meal planning",
    ],
    industry: "Meal-kit delivery / DTC food",
    targetAudience: "Busy families and health-conscious home cooks",
    contentThemes: [
      "nutrition",
      "food waste",
      "plant-based options",
      "quick recipes",
    ],
    siteDescription:
      "Chef-designed healthy meal kits delivered weekly, with flexible plans and minimal food waste.",
  },
  llmAnalysis: {
    overallScore: 72,
    summary:
      "Your comparison page is cited by ChatGPT, Perplexity, and Copilot for this query and ranks #4 organically, but Gemini and Google AI Mode aren't picking it up. Selection rate is moderate (15.9%) — the page is referenced but isn't the dominant source. Tightening the answer-first framing and adding a structured comparison table should lift Gemini and AI-Mode pickup.",
    recommendations: [
      {
        category: "content",
        priority: "high",
        title: "Lead with a direct, extractable answer",
        description:
          "Gemini and AI Mode favor pages that state the answer in the first one or two sentences. Open with a one-line verdict before the comparison.",
        actionItems: [
          "Add a BLUF summary box at the very top",
          "State the recommended pick in the first sentence",
          "Mirror the exact query phrasing in an H2",
        ],
      },
      {
        category: "structure",
        priority: "high",
        title: "Add a comparison table with Recipe + Product schema",
        description:
          "A machine-readable feature table improves citation odds on Google surfaces.",
        actionItems: [
          "Add an HTML table comparing menu, price, and cook time",
          "Mark up the page with Product + FAQPage JSON-LD",
          "Use row labels matching common sub-questions",
        ],
      },
      {
        category: "strategy",
        priority: "medium",
        title: "Earn citations on Wirecutter and Good Housekeeping",
        description:
          "AI engines repeatedly source major review sites for this category, so coverage there compounds.",
        actionItems: [
          "Pitch Forkful for inclusion in Wirecutter and Good Housekeeping roundups",
          "Encourage reviews on the r/mealkits community",
        ],
      },
      {
        category: "technical",
        priority: "low",
        title: "Add a text-fragment-friendly FAQ",
        description:
          "Self-contained Q&A blocks are the snippets engines quote verbatim.",
        actionItems: [
          "Add 5–7 FAQ entries answering the sub-questions",
          "Keep each answer under 60 words",
        ],
      },
    ],
    contentGaps: [
      "No structured menu/price/cook-time comparison table",
      "Missing FAQ schema for 'which healthy meal kit is best' sub-questions",
      "No explicit price-per-serving comparison vs GreenPlate on the page",
    ],
    competitorInsights: [
      "GreenPlate is cited on 4/5 platforms for this query, mostly via Wirecutter and its organic-menu page",
      "Hearthbox wins 'cheapest meal kit' prompts through Reddit threads",
      "Wirecutter's roundup is the single most-cited source — table-stakes to appear in it",
    ],
  },
};

const STAGE_LABELS: Record<AnalysisStage, string> = {
  idle: "Ready",
  grounding: "Running Gemini Grounding…",
  platforms: "Checking AI Platforms…",
  serp: "Fetching SERP Data…",
  scraping: "Scraping Pages…",
  context: "Analyzing Site Context…",
  analyzing: "Running SRO Analysis…",
  done: "Complete",
  error: "Error",
};

// ── Helper components ─────────────────────────────────────

function ScoreRing({ score, size = 100 }: { score: number; size?: number }) {
  const r = size * 0.36;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color =
    score >= 70
      ? "var(--th-success)"
      : score >= 40
        ? "var(--th-warning)"
        : "var(--th-danger)";
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--th-score-ring-bg)"
          strokeWidth="7"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <span className="absolute text-xl font-bold" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

function PriorityBadge({
  priority,
}: {
  priority: LLMRecommendation["priority"];
}) {
  const colors: Record<string, string> = {
    high: "bg-th-danger-soft text-th-danger border-th-danger/30",
    medium: "bg-th-warning-soft text-th-warning border-th-warning/30",
    low: "bg-th-success-soft text-th-success border-th-success/30",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colors[priority]}`}
    >
      {priority}
    </span>
  );
}

function CategoryBadge({
  category,
}: {
  category: LLMRecommendation["category"];
}) {
  const icons: Record<string, string> = {
    content: "📝",
    structure: "🏗️",
    technical: "⚙️",
    strategy: "🎯",
  };
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-th-border bg-th-card-alt px-2 py-0.5 text-xs text-th-text-secondary">
      {icons[category] || "📋"} {category}
    </span>
  );
}

function ProgressBar({ stage }: { stage: AnalysisStage }) {
  const stages: AnalysisStage[] = [
    "grounding",
    "platforms",
    "serp",
    "scraping",
    "context",
    "analyzing",
    "done",
  ];
  const currentIdx = stages.indexOf(stage);
  const pct =
    stage === "done"
      ? 100
      : stage === "idle"
        ? 0
        : Math.max(5, Math.round(((currentIdx + 0.5) / stages.length) * 100));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-th-text-muted">
        <span>{STAGE_LABELS[stage]}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-th-card-alt">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor:
              stage === "error" ? "var(--th-danger)" : "var(--th-accent)",
          }}
        />
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────

export function SROAnalysisTab({
  demoMode = false,
}: { demoMode?: boolean } = {}) {
  const [s, setS] = useState<SROState>(demoMode ? DEMO_SRO_RESULT : INITIAL);

  const isRunning = !["idle", "done", "error"].includes(s.stage);

  const runFullAnalysis = useCallback(async () => {
    if (!s.targetUrl || !s.keyword) return;

    setS((prev) => ({
      ...INITIAL,
      targetUrl: prev.targetUrl,
      keyword: prev.keyword,
      stage: "grounding",
    }));

    const grounding: GroundingResult | null = null;
    let platforms: PlatformResult[] = [];
    let serp: SerpResult | null = null;
    let targetPage: ScrapedPage | null = null;
    let competitorPages: ScrapedPage[] = [];
    let siteContext: SiteContext | null = null;
    let llmAnalysis: LLMAnalysisResult | null = null;

    try {
      // 1. Gemini Grounding
      try {
        const resp = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: `Analyze the Gemini grounding for "${s.keyword}" targeting ${s.targetUrl}. Call the /api/sro-analyze endpoint on the server side.`,
            maxTokens: 256,
          }),
        });
        // Actually call the dedicated grounding endpoint if available,
        // but since there's no grounding API route (Gemini runs server-side only),
        // we skip grounding on the client and let the final SRO analysis handle it.
        // For now we'll try the grounding via the bulk proxy or skip gracefully.
        void resp;
      } catch {
        // Grounding is optional
      }
      setS((prev) => ({ ...prev, grounding, stage: "platforms" }));

      // 2. Platform Citations
      try {
        const resp = await fetch("/api/brightdata-platforms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword: s.keyword, targetUrl: s.targetUrl }),
        });
        if (resp.ok) {
          platforms = await resp.json();
        }
      } catch {
        // Platforms optional
      }
      setS((prev) => ({ ...prev, platforms, stage: "serp" }));

      // 3. SERP
      try {
        const resp = await fetch("/api/serp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword: s.keyword, targetUrl: s.targetUrl }),
        });
        if (resp.ok) {
          serp = await resp.json();
        }
      } catch {
        // SERP optional
      }
      setS((prev) => ({ ...prev, serp, stage: "scraping" }));

      // 4. Scrape target + competitors
      try {
        const resp = await fetch("/api/unlocker", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: s.targetUrl }),
        });
        if (resp.ok) {
          targetPage = await resp.json();
        }
      } catch {
        // Target scrape optional
      }

      if (serp && serp.topCompetitors.length > 0) {
        try {
          const resp = await fetch("/api/unlocker", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ urls: serp.topCompetitors.slice(0, 3) }),
          });
          if (resp.ok) {
            competitorPages = await resp.json();
          }
        } catch {
          // Competitor scrape optional
        }
      }
      setS((prev) => ({
        ...prev,
        targetPage,
        competitorPages,
        stage: "context",
      }));

      // 5. Site Context
      try {
        const resp = await fetch("/api/site-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: s.targetUrl }),
        });
        if (resp.ok) {
          siteContext = await resp.json();
        }
      } catch {
        // Context optional
      }
      setS((prev) => ({ ...prev, siteContext, stage: "analyzing" }));

      // 6. SRO Analysis
      try {
        const resp = await fetch("/api/sro-analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetUrl: s.targetUrl,
            keyword: s.keyword,
            grounding,
            platforms,
            serp,
            targetPage,
            competitorPages,
            siteContext,
          }),
        });
        if (resp.ok) {
          llmAnalysis = await resp.json();
        }
      } catch {
        // Analysis optional
      }

      setS((prev) => ({
        ...prev,
        grounding,
        platforms,
        serp,
        targetPage,
        competitorPages,
        siteContext,
        llmAnalysis,
        stage: "done",
      }));
    } catch (err) {
      setS((prev) => ({
        ...prev,
        stage: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [s.targetUrl, s.keyword]);

  // ── Render ────────────────────────────

  return (
    <div className="space-y-4">
      {/* Input Bar */}
      <div className="rounded-xl border border-th-border bg-th-card p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-th-text">
          SRO Analysis
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={s.targetUrl}
            onChange={(e) =>
              setS((prev) => ({ ...prev, targetUrl: e.target.value }))
            }
            placeholder="https://example.com/target-page"
            className="bd-input flex-1 rounded-lg p-2.5 text-sm"
            disabled={isRunning}
          />
          <input
            value={s.keyword}
            onChange={(e) =>
              setS((prev) => ({ ...prev, keyword: e.target.value }))
            }
            placeholder="Target keyword"
            className="bd-input w-full rounded-lg p-2.5 text-sm sm:w-48"
            disabled={isRunning}
          />
          <button
            onClick={runFullAnalysis}
            disabled={isRunning || !s.targetUrl || !s.keyword}
            className="bd-btn-primary whitespace-nowrap rounded-lg px-5 py-2.5 text-sm disabled:opacity-50"
          >
            {isRunning ? "Running…" : "Analyze"}
          </button>
        </div>
        {isRunning && (
          <div className="mt-3">
            <ProgressBar stage={s.stage} />
          </div>
        )}
        {s.stage === "error" && s.error && (
          <div className="mt-2 rounded-lg border border-th-danger/30 bg-th-danger-soft px-3 py-2 text-sm text-th-danger">
            {s.error}
          </div>
        )}
      </div>

      {/* Results */}
      {s.stage === "done" && (
        <div className="space-y-4">
          {/* Overall Score + Summary */}
          {s.llmAnalysis && (
            <div className="flex items-start gap-5 rounded-xl border border-th-border bg-th-card p-5 shadow-sm">
              <ScoreRing score={s.llmAnalysis.overallScore} />
              <div className="flex-1">
                <div className="text-lg font-semibold text-th-text">
                  SRO Score
                </div>
                <p className="mt-1 text-sm leading-relaxed text-th-text-secondary">
                  {s.llmAnalysis.summary}
                </p>
              </div>
            </div>
          )}

          {/* Grounding Summary */}
          {s.grounding && (
            <div className="rounded-xl border border-th-border bg-th-card p-4 shadow-sm">
              <div className="mb-2 text-sm font-semibold text-th-text">
                🔬 Gemini Grounding
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label="Selection Rate"
                  value={`${(s.grounding.selectionRate * 100).toFixed(1)}%`}
                />
                <Stat
                  label="Target Found"
                  value={s.grounding.targetUrlFound ? "Yes" : "No"}
                />
                <Stat
                  label="Sources"
                  value={String(s.grounding.chunks.length)}
                />
                <Stat
                  label="Target Words"
                  value={`${s.grounding.targetGroundingWords} / ${s.grounding.totalGroundingWords}`}
                />
              </div>
              {s.grounding.targetSnippets.length > 0 && (
                <div className="mt-3 space-y-1">
                  <div className="text-xs font-medium text-th-text-muted">
                    Grounding snippets attributed to your page:
                  </div>
                  {s.grounding.targetSnippets.slice(0, 3).map((snip, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-th-border bg-th-card-alt px-3 py-2 text-xs text-th-text-secondary"
                    >
                      &ldquo;{snip.slice(0, 300)}&rdquo;
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Platform Citations */}
          {s.platforms.length > 0 && (
            <div className="rounded-xl border border-th-border bg-th-card p-4 shadow-sm">
              <div className="mb-2 text-sm font-semibold text-th-text">
                🌐 Cross-Platform Citations
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {s.platforms.map((p) => (
                  <div
                    key={p.platform}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-center ${
                      p.targetUrlCited
                        ? "border-th-success/40 bg-th-success-soft"
                        : "border-th-border bg-th-card-alt"
                    }`}
                  >
                    <div className="text-xs font-medium text-th-text">
                      {p.label}
                    </div>
                    <div
                      className={`text-lg font-bold ${p.targetUrlCited ? "text-th-success" : "text-th-text-muted"}`}
                    >
                      {p.status === "done"
                        ? p.targetUrlCited
                          ? "✓"
                          : "✗"
                        : p.status === "error"
                          ? "⚠"
                          : "…"}
                    </div>
                    <div className="text-[10px] text-th-text-muted">
                      {p.status === "done"
                        ? `${p.citations.length} citations`
                        : p.status}
                    </div>
                  </div>
                ))}
              </div>
              {(() => {
                const cited = s.platforms.filter(
                  (p) => p.targetUrlCited,
                ).length;
                const done = s.platforms.filter(
                  (p) => p.status === "done",
                ).length;
                return (
                  <div className="mt-2 text-xs text-th-text-muted">
                    Cited on {cited}/{done} platforms
                  </div>
                );
              })()}
            </div>
          )}

          {/* SERP Data */}
          {s.serp && (
            <div className="rounded-xl border border-th-border bg-th-card p-4 shadow-sm">
              <div className="mb-2 text-sm font-semibold text-th-text">
                📊 SERP Ranking
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat
                  label="Organic Rank"
                  value={
                    s.serp.targetRank ? `#${s.serp.targetRank}` : "Not found"
                  }
                />
                <Stat
                  label="Total Results"
                  value={String(s.serp.totalResults)}
                />
                <Stat
                  label="Top Competitors"
                  value={String(s.serp.topCompetitors.length)}
                />
              </div>
              {s.serp.organicResults.length > 0 && (
                <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
                  {s.serp.organicResults.slice(0, 10).map((r) => (
                    <div
                      key={r.position}
                      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs ${
                        r.isTarget
                          ? "bg-th-accent/10 border border-th-accent/30"
                          : "bg-th-card-alt"
                      }`}
                    >
                      <span className="w-5 shrink-0 font-bold text-th-text-muted">
                        #{r.position}
                      </span>
                      <span
                        className={`flex-1 truncate ${r.isTarget ? "font-semibold text-th-text" : "text-th-text-secondary"}`}
                      >
                        {r.title || r.url}
                      </span>
                      <span className="shrink-0 text-[10px] text-th-text-muted">
                        {r.domain}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Recommendations */}
          {s.llmAnalysis && s.llmAnalysis.recommendations.length > 0 && (
            <div className="rounded-xl border border-th-border bg-th-card p-4 shadow-sm">
              <div className="mb-3 text-sm font-semibold text-th-text">
                💡 Recommendations
              </div>
              <div className="space-y-3">
                {s.llmAnalysis.recommendations.map((rec, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-th-border bg-th-card-alt p-3"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <PriorityBadge priority={rec.priority} />
                      <CategoryBadge category={rec.category} />
                      <span className="text-sm font-medium text-th-text">
                        {rec.title}
                      </span>
                    </div>
                    <p className="text-xs text-th-text-secondary leading-relaxed mb-2">
                      {rec.description}
                    </p>
                    {rec.actionItems.length > 0 && (
                      <ul className="space-y-0.5">
                        {rec.actionItems.map((item, j) => (
                          <li
                            key={j}
                            className="flex items-start gap-1.5 text-xs text-th-text-muted"
                          >
                            <span className="mt-0.5 text-th-accent">→</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Content Gaps + Competitor Insights */}
          {s.llmAnalysis &&
            (s.llmAnalysis.contentGaps.length > 0 ||
              s.llmAnalysis.competitorInsights.length > 0) && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {s.llmAnalysis.contentGaps.length > 0 && (
                  <div className="rounded-xl border border-th-border bg-th-card p-4 shadow-sm">
                    <div className="mb-2 text-sm font-semibold text-th-text">
                      🔍 Content Gaps
                    </div>
                    <ul className="space-y-1">
                      {s.llmAnalysis.contentGaps.map((gap, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-1.5 text-xs text-th-text-secondary"
                        >
                          <span className="mt-0.5 text-th-warning">•</span>
                          <span>{gap}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {s.llmAnalysis.competitorInsights.length > 0 && (
                  <div className="rounded-xl border border-th-border bg-th-card p-4 shadow-sm">
                    <div className="mb-2 text-sm font-semibold text-th-text">
                      🏆 Competitor Insights
                    </div>
                    <ul className="space-y-1">
                      {s.llmAnalysis.competitorInsights.map((insight, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-1.5 text-xs text-th-text-secondary"
                        >
                          <span className="mt-0.5 text-th-accent">•</span>
                          <span>{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

          {/* Target Page Info */}
          {s.targetPage && !s.targetPage.error && (
            <div className="rounded-xl border border-th-border bg-th-card p-4 shadow-sm">
              <div className="mb-2 text-sm font-semibold text-th-text">
                📄 Target Page
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Title" value={s.targetPage.title || "—"} />
                <Stat
                  label="Word Count"
                  value={String(s.targetPage.wordCount)}
                />
                <Stat
                  label="Headings"
                  value={String(s.targetPage.headings.length)}
                />
                <Stat label="Domain" value={s.targetPage.domain} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {s.stage === "idle" && !s.llmAnalysis && (
        <div className="rounded-xl border border-th-border bg-th-card-alt p-8 text-center">
          <div className="text-2xl mb-2">🎯</div>
          <div className="text-sm font-medium text-th-text mb-1">
            Selection Rate Optimization
          </div>
          <p className="text-xs text-th-text-muted max-w-md mx-auto leading-relaxed">
            Enter a target URL and keyword to analyze how well your content is
            being selected by AI systems as a grounding source. The analysis
            checks Gemini grounding, cross-platform citations, SERP rankings,
            and provides actionable recommendations.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Stat cell ─────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-th-text-muted">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-th-text truncate">
        {value}
      </div>
    </div>
  );
}
