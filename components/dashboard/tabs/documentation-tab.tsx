"use client";

import { useState } from "react";

type DocSection = {
  id: string;
  title: string;
  icon: string;
  content: string[];
};

const sections: DocSection[] = [
  {
    id: "overview",
    title: "Overview",
    icon: "📖",
    content: [
      "The GEO/AEO Tracker is a local-first, open-source intelligence dashboard that monitors how your brand appears across AI models — ChatGPT, Perplexity, Gemini, Copilot, and Google AI Mode.",
      "All data is stored in your browser (localStorage + IndexedDB). Nothing leaves your machine unless you explicitly trigger a scrape or analysis via the configured API.",
      "Key capabilities: multi-model brand tracking, visibility scoring, sentiment analysis, citation discovery, competitor battlecards, AEO site audits, and automation templates.",
    ],
  },
  {
    id: "project-settings",
    title: "Project Settings",
    icon: "⚙️",
    content: [
      "Configure your brand identity: name, aliases, website URL, industry, target keywords, and a short description.",
      "This context is injected into every AI prompt so that analysis stays relevant to your business.",
      "Brand aliases let you track abbreviations or informal names (e.g., 'BD' for 'Bright Data').",
      "You can reset all data from this tab if you need a clean slate.",
    ],
  },
  {
    id: "prompt-hub",
    title: "Prompt Hub",
    icon: "💬",
    content: [
      "Build a library of tracking prompts. Use {brand} as a placeholder — it will be replaced with your brand name at runtime.",
      "Run a single prompt against all active models, or batch-run your entire library in one click.",
      "Prompts are stored per workspace, so each brand can have its own prompt set.",
      "Tip: Include 'with sources' or 'include references' in your prompts to encourage AI models to cite URLs you can analyze in the Citations tab.",
    ],
  },
  {
    id: "persona-fanout",
    title: "Persona Fan-Out",
    icon: "👥",
    content: [
      "Write one core query and define a list of personas (CMO, SEO Lead, Founder, etc.).",
      "The system generates persona-specific prompt variants automatically.",
      "Run each variant independently to see how different audience angles change model responses and brand visibility.",
      "This helps identify which buyer personas your brand resonates with most across AI models.",
    ],
  },
  {
    id: "niche-explorer",
    title: "Niche Explorer",
    icon: "🔍",
    content: [
      "Enter your niche or product category and generate high-intent search queries that real buyers would type into AI assistants.",
      "Queries are AI-generated and focus on informational, comparison, and decision-stage intent.",
      "Add any generated query directly to your Prompt Hub for ongoing tracking.",
      "Use this to build a comprehensive monitoring set beyond the prompts you can think of yourself.",
    ],
  },
  {
    id: "responses",
    title: "Responses",
    icon: "📝",
    content: [
      "Browse all collected AI model responses grouped by prompt.",
      "Each response shows: provider badge, visibility score (0–100), sentiment tag, brand/competitor highlights, and cited sources.",
      "Filter by model, sentiment, or sort by date or score.",
      "The insight strip at the top shows aggregate stats: average score, brand mention rate, sentiment breakdown, and per-model averages.",
      "Expand any response card to read the full AI answer with brand terms highlighted in blue and competitor terms in orange.",
    ],
  },
  {
    id: "visibility-analytics",
    title: "Visibility Analytics",
    icon: "📊",
    content: [
      "Track your brand's average visibility score over time with a trend line chart.",
      "The chart plots daily average visibility % across all prompts and models.",
      "Summary cards show overall average visibility, and sentiment distribution (positive, neutral, negative, not-mentioned).",
      "Export all run data or trend data as CSV for external analysis.",
    ],
  },
  {
    id: "citations",
    title: "Citations",
    icon: "🔗",
    content: [
      "Analyze which URLs and domains AI models cite most frequently in their responses.",
      "Browse a ranked table of top cited domains, search by URL or domain, sort by citations/pages/prompts/alphabetical.",
      "Toggle between domain-level and URL-level views.",
      "Filter by minimum citation count and export the full table as CSV.",
      "Your own website is badged with a 'Your site' indicator so you can quickly see if your domain is being cited.",
      "Citation Opportunities KPI: counts unique domains cited in responses where your brand was NOT mentioned — these are outreach targets.",
    ],
  },
  {
    id: "battlecards",
    title: "Competitor Battlecards",
    icon: "🏆",
    content: [
      "Enter competitor names (comma-separated) and generate AI-powered battlecards.",
      "Each battlecard includes: sentiment, summary, strengths, weaknesses, pricing insights, AI visibility notes, and key differentiators.",
      "Battlecards are color-coded by sentiment (green = positive, yellow = neutral, red = negative).",
      "Use these to understand how AI models perceive your competitors relative to your brand.",
    ],
  },
  {
    id: "aeo-audit",
    title: "AEO Audit",
    icon: "✅",
    content: [
      "Enter any URL to run an Answer Engine Optimization audit.",
      "Checks include: llms.txt presence, schema/structured data signals, BLUF (Bottom Line Up Front) content clarity, and technical readiness.",
      "Each check is categorized (discovery, structure, content, technical, rendering) with pass/fail status and details.",
      "The overall score (0–100) tells you how ready the page is to be surfaced in AI-generated answers.",
    ],
  },
  {
    id: "sro-analysis",
    title: "SRO Analysis",
    icon: "📡",
    content: [
      "Search Result Optimization (SRO) runs a 5-stage analysis pipeline for any URL + keyword combination. Gemini Grounding (whether Gemini cites your page in its grounding metadata) runs only through the /api/bulk-sro endpoint and shows as skipped here.",
      "Stage 1 — Cross-Platform Citations: scrapes 5 AI platforms (ChatGPT, Perplexity, Gemini, Google AI, Copilot) to see which cite your URL.",
      "Stage 2 — SERP Data: fetches real organic search results to find your ranking position and top competitors.",
      "Stage 3 — Page Scraping: scrapes your target page + top competitor pages for content comparison.",
      "Stage 4 — Site Context: extracts key information from your homepage for context-aware recommendations.",
      "Stage 5 — LLM Analysis: a large language model synthesizes all gathered data into an SRO Score (0–100), actionable recommendations, content gaps, and competitor insights.",
      "Results include: overall score ring, platform citation grid, SERP ranking table, prioritized recommendations with action items, content gaps, and competitor insights.",
      "The SRO tab stays mounted in the background — you can switch to other tabs while the analysis runs without losing progress.",
      "Note: The Platform Citations stage can take several minutes as it polls Bright Data for results across all 5 AI platforms.",
    ],
  },
  {
    id: "rank-signal",
    title: "Rank Signal",
    icon: "🧪",
    content: [
      "Rank Signal sits in the SRO tab after an analysis runs. It is a pairwise preference proxy, next to the SRO score's live grounding share. Method after DEJAN AI's Rank Signal (dejan.ai/optimizer-sample).",
      "Passages come from your page and the top 3 competitors; when that gives fewer than 40, the rest of the SERP top 10 is scraped to top the pool up to 60. One trial: a passage is edited into two versions that differ only in one text feature (with / without). A judge model sees the query and both versions, without URLs, and picks one. A win means it picked the version with the feature.",
      "Wins are scored with a Jeffreys posterior, Beta(wins + 0.5, losses + 0.5), and a 95% interval. Rule: interval above 50% = positive, below 50% = negative, n of 40 or more otherwise = no clear effect, and fewer than 20 trials = inconclusive.",
      "The verdict is read only at n = 20, 30 and 40 (40 is the maximum per run), which keeps false verdicts near 8% when a feature has no real effect.",
      "Power is limited: at n = 40 a true 70% effect is confirmed about 74% of the time and a true 65% effect about half the time. \"No clear effect\" is not \"no effect\". The All runs view pools trials across runs, but it is descriptive only.",
      "S00 is a placebo: one existing sentence is paraphrased with the same facts and a similar length, so nothing about the content changes. Its interval shows how much the judge reacts to any edit, and LLM-built signals whose interval overlaps it are marked \"within edit-bias range\".",
      "Cost: about $0.28 per LLM-built signal and $0.07 per code-built signal at n = 40 with the default models; a full run stays under the $5 default cap. The server also enforces an hourly cap (RANK_SIGNAL_MAX_USD_PER_HOUR, default $10) and a model allowlist. Topping up a small pool costs one Bright Data SERP call and up to 10 Web Unlocker requests per run (cached for 30 minutes, so later signals reuse it).",
    ],
  },
  {
    id: "automation",
    title: "Automation",
    icon: "⚡",
    content: [
      "Store deployment-ready scheduling templates for recurring prompt runs.",
      "Cron expression editor for Vercel Cron or server-side scheduling.",
      "GitHub Actions workflow template for CI/CD-based automated tracking.",
      "Copy either template directly into your infrastructure for hands-off monitoring.",
    ],
  },
  {
    id: "workspaces",
    title: "Multi-Brand Workspaces",
    icon: "🏢",
    content: [
      "Create separate workspaces for each brand or client you track.",
      "Each workspace has its own settings, prompts, runs, and data — fully isolated.",
      "Switch between workspaces instantly via the sidebar brand picker.",
      "All workspace data is stored locally in your browser.",
    ],
  },
  {
    id: "scoring",
    title: "Visibility Scoring",
    icon: "🎯",
    content: [
      "Each AI response is scored 0–100 based on how prominently your brand appears:",
      "• Brand mentioned at all → +30 points",
      "• Mentioned in the first 200 characters (prominent position) → +20 points",
      "• Multiple mentions: 2+ times → +8, 3+ times → +15 points",
      "• Your website URL cited in sources → +20 points",
      "• Positive sentiment detected → +15 points, Neutral → +5 points",
      "Scores are capped at 100. A score of 0 means the brand was not mentioned at all.",
    ],
  },
  {
    id: "models",
    title: "Supported AI Models",
    icon: "🤖",
    content: [
      "The tracker supports 5 AI model providers via Bright Data's Scraper API:",
      "• ChatGPT — OpenAI's conversational model",
      "• Perplexity — Search-focused AI with real-time citations",
      "• Copilot — Microsoft's AI assistant",
      "• Gemini — Google's multimodal AI",
      "• Google AI — Google AI Overview / SGE results",
      "Toggle models on/off in the toolbar. Run prompts across any combination simultaneously.",
    ],
  },
  {
    id: "data-privacy",
    title: "Data & Privacy",
    icon: "🔒",
    content: [
      "All data is stored locally in your browser using localStorage and IndexedDB.",
      "No data is sent to any server except when you explicitly run a scrape (via Bright Data API) or an analysis (via your configured LLM API).",
      "You can export all data as CSV from the Analytics tab.",
      "Use the Reset Data button in Project Settings to permanently delete all stored data for the active workspace.",
      "BYOK (Bring Your Own Key) architecture — you provide your own API keys.",
    ],
  },
  {
    id: "api-routes",
    title: "API Routes",
    icon: "🛰️",
    content: [
      "The tracker exposes 11 API routes under /api/:",
      "• POST /api/scrape — Query AI models via Bright Data AI Scrapers. Accepts provider, prompt, and requireSources. Returns structured AI responses with brand analysis.",
      "• POST /api/analyze — OpenRouter LLM inference for battlecards, niche queries, and persona generation. Runs on the Node.js runtime.",
      "• POST /api/audit — AEO site audit. Crawls a URL and checks for llms.txt, Schema.org, BLUF density, heading structure, and more.",
      "• POST /api/sro-analyze — Final SRO analysis. Takes all gathered data (grounding, platforms, SERP, scraped pages, site context) and returns an overall SRO score with recommendations.",
      "• POST /api/serp — Fetches organic SERP results via Bright Data SERP API for a given keyword.",
      "• POST /api/site-context — Scrapes a homepage and extracts key context (meta info, headings, key phrases) for SRO analysis.",
      "• POST /api/unlocker — Scrapes one or multiple URLs via Bright Data Web Unlocker. Supports single url or batch urls mode.",
      "• POST /api/brightdata-platforms — Polls 5 AI platforms via Bright Data dataset API to check for brand citations.",
      "• POST /api/bulk-sro — SSE streaming endpoint for running SRO analysis across multiple keywords at once.",
      "• POST /api/rank-signal — SSE streaming endpoint for Rank Signal. Runs one signal's paired A/B trials on the scraped pages and streams progress, checkpoints and the result. GET returns the signal list and allowed judge models.",
      "• GET/PUT/DELETE /api/state: optional cloud sync through your own Supabase project. Needs STATE_SYNC_SECRET and the x-sync-secret header; answers 503 when cloud sync is not configured.",
      "All routes include input validation and error handling. Most routes use in-memory caching to minimize API costs.",
    ],
  },
  {
    id: "environment",
    title: "Environment Setup",
    icon: "🔑",
    content: [
      "The app requires 3 API keys in your .env file:",
      "• BRIGHT_DATA_KEY — Your Bright Data API token. Powers all AI scraping, SERP, Web Unlocker, and platform citation features.",
      "• OPENROUTER_KEY — Your OpenRouter API key. Used for LLM inference (battlecards, niche queries, SRO final analysis, site context extraction).",
      "• GEMINI_API_KEY — Your Google Gemini API key. Used for the Gemini Grounding stage of /api/bulk-sro.",
      "Additionally, 5 Bright Data dataset IDs are needed for the AI Scraper endpoints:",
      "• BRIGHT_DATA_DATASET_CHATGPT, BRIGHT_DATA_DATASET_PERPLEXITY, BRIGHT_DATA_DATASET_COPILOT, BRIGHT_DATA_DATASET_GEMINI, BRIGHT_DATA_DATASET_GOOGLE_AI (all optional — public defaults ship with the app)",
      "Optional zone overrides: BRIGHT_DATA_SERP_ZONE (default: serp_api1), BRIGHT_DATA_UNLOCKER_ZONE (default: web_unlocker1).",
      "• RANK_SIGNAL_JUDGE_MODEL — Rank Signal judge model (default: google/gemini-3.6-flash).",
      "• RANK_SIGNAL_REWRITE_MODEL — model that builds the with/without pairs (default: OPENROUTER_MODEL, then google/gemini-3.5-flash).",
      "• RANK_SIGNAL_ALLOWED_MODELS — comma list of models Rank Signal may use (default: the two models above). Each also needs an entry in the price table.",
      "• RANK_SIGNAL_MAX_USD_PER_HOUR — server-side Rank Signal spend cap per hour (default: 10). In-memory per instance, so it stops bursts but is not a global limit.",
      "Copy .env.example to .env and fill in your keys to get started.",
    ],
  },
];

export function DocumentationTab() {
  const [activeSection, setActiveSection] = useState("overview");
  const [search, setSearch] = useState("");

  const filteredSections = search.trim()
    ? sections.filter(
        (s) =>
          s.title.toLowerCase().includes(search.toLowerCase()) ||
          s.content.some((line) =>
            line.toLowerCase().includes(search.toLowerCase()),
          ),
      )
    : sections;

  const current = sections.find((s) => s.id === activeSection);

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      {/* Sidebar TOC */}
      <div className="w-full md:w-52 md:shrink-0">
        <div className="mb-3">
          <input
            type="text"
            placeholder="Search docs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bd-input w-full rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <nav className="flex gap-1 overflow-x-auto md:block md:max-h-[65vh] md:space-y-0.5 md:overflow-x-visible md:overflow-y-auto">
          {filteredSections.map((section) => (
            <button
              key={section.id}
              onClick={() => {
                setActiveSection(section.id);
                setSearch("");
              }}
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors md:w-full ${
                activeSection === section.id
                  ? "bg-th-accent-soft text-th-text-accent font-medium"
                  : "text-th-text-secondary hover:bg-th-card-hover hover:text-th-text"
              }`}
            >
              <span className="text-sm">{section.icon}</span>
              <span className="truncate">{section.title}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {current ? (
          <div>
            <div className="mb-4 flex items-center gap-3">
              <span className="text-2xl">{current.icon}</span>
              <h2 className="text-lg font-semibold text-th-text">
                {current.title}
              </h2>
            </div>
            <div className="space-y-3">
              {current.content.map((line, i) => {
                if (line.startsWith("• ")) {
                  return (
                    <div
                      key={i}
                      className="ml-4 flex items-start gap-2 text-sm text-th-text-secondary leading-relaxed"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-th-accent" />
                      <span>{line.slice(2)}</span>
                    </div>
                  );
                }
                return (
                  <p
                    key={i}
                    className="text-sm leading-relaxed text-th-text-secondary"
                  >
                    {line}
                  </p>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-th-text-muted">
            {search
              ? `No documentation matches "${search}".`
              : "Select a section from the sidebar."}
          </div>
        )}

        {/* Quick nav */}
        {current && (
          <div className="mt-6 flex items-center gap-2 border-t border-th-border pt-4">
            {(() => {
              const idx = sections.findIndex((s) => s.id === current.id);
              const prev = idx > 0 ? sections[idx - 1] : null;
              const next = idx < sections.length - 1 ? sections[idx + 1] : null;
              return (
                <>
                  {prev && (
                    <button
                      onClick={() => setActiveSection(prev.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-th-border px-3 py-1.5 text-xs text-th-text-secondary hover:bg-th-card-hover transition-colors"
                    >
                      ← {prev.title}
                    </button>
                  )}
                  <div className="flex-1" />
                  {next && (
                    <button
                      onClick={() => setActiveSection(next.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-th-border px-3 py-1.5 text-xs text-th-text-secondary hover:bg-th-card-hover transition-colors"
                    >
                      {next.title} →
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
