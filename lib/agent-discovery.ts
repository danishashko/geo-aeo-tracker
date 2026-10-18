// Agent discovery layer: robots, sitemap, llms.txt, llms-full.txt and the
// markdown twin. Everything is public only on demo deploys
// (NEXT_PUBLIC_DEMO_ONLY=true). A private self-host stays closed to crawlers.

export const REPO_URL = "https://github.com/danishashko/geo-aeo-tracker";
const REPO_BLOB = `${REPO_URL}/blob/main`;

type Env = Record<string, string | undefined>;

/** True only when NEXT_PUBLIC_DEMO_ONLY is "true" (the public read-only preview). */
export function isDemoDeploy(
  value: string | undefined = process.env.NEXT_PUBLIC_DEMO_ONLY,
): boolean {
  return (value ?? "").trim().toLowerCase() === "true";
}

const LOCAL_ORIGIN = "http://localhost:3000";

/** Adds https:// when there is no scheme, drops trailing slashes, null if unparsable. */
function normalizeOrigin(raw: string): string | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
    ? raw
    : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return withScheme.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** NEXT_PUBLIC_SITE_URL, else the Vercel production domain, else localhost. */
export function siteOrigin(env: Env = process.env): string {
  const explicit = (env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (explicit) return normalizeOrigin(explicit) ?? LOCAL_ORIGIN;
  const vercel = (env.VERCEL_PROJECT_PRODUCTION_URL ?? "").trim();
  if (vercel)
    return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return LOCAL_ORIGIN;
}

const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Bingbot",
  "Googlebot",
];

export function robotsTxt(demo: boolean, origin: string): string {
  if (!demo) return "User-agent: *\nDisallow: /\n";
  const groups = [
    "User-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=yes\nAllow: /\nDisallow: /api/",
    ...AI_BOTS.map((bot) => `User-agent: ${bot}\nAllow: /\nDisallow: /api/`),
  ];
  return `${groups.join("\n\n")}\n\nSitemap: ${origin}/sitemap.xml\n`;
}

export function sitemapUrls(demo: boolean, origin: string): string[] {
  return demo ? [`${origin}/`, `${origin}/demo`] : [];
}

/** Link header for `/` on demo deploys. */
export const LINK_HEADER = [
  '</llms.txt>; rel="llms-txt"',
  '</llms-full.txt>; rel="llms-full-txt"',
  '</sitemap.xml>; rel="sitemap"',
  '</index.md>; rel="alternate"; type="text/markdown"',
  `<${REPO_URL}>; rel="describedby"`,
].join(", ");

/**
 * True when the client prefers markdown: text/markdown is listed with q > 0
 * and its q is at least the q of an explicit text/html entry.
 */
export function wantsMarkdown(accept: string | null | undefined): boolean {
  if (!accept) return false;
  const q = new Map<string, number>();
  for (const part of accept.split(",")) {
    const [type, ...params] = part.trim().toLowerCase().split(";");
    let value = 1;
    for (const p of params) {
      const m = p.trim().match(/^q=([\d.]+)$/);
      if (m) value = Number(m[1]);
    }
    if (type) q.set(type.trim(), Number.isNaN(value) ? 0 : value);
  }
  const md = q.get("text/markdown") ?? 0;
  return md > 0 && md >= (q.get("text/html") ?? 0);
}

const SUMMARY =
  "Open-source, local-first dashboard that tracks how 5 AI models (ChatGPT, Perplexity, Gemini, Copilot and Google AI Mode) mention your brand. Self-hosted, MIT licensed, bring your own API keys.";

const FEATURE_TABS: Array<[string, string]> = [
  [
    "Project Settings",
    "Brand name, aliases, website, industry, keywords, description",
  ],
  [
    "Prompt Hub",
    "Manage tracking prompts with {brand} injection. Run single or batch across models in parallel",
  ],
  [
    "Persona Fan-Out",
    "Generate persona-specific prompt variants (CMO, SEO Lead, Founder, etc.)",
  ],
  ["Niche Explorer", "AI-generated high-intent queries for your niche"],
  [
    "Responses",
    "Browse AI responses with brand/competitor highlighting, filters, and search",
  ],
  [
    "Visibility Analytics",
    "Score trends over time via Recharts line charts. CSV export",
  ],
  ["Citations", "Domain-grouped citation frequency analysis"],
  [
    "Citation Opportunities",
    "URLs where competitors get cited but you don't, with outreach briefs",
  ],
  [
    "Competitor Battlecards",
    "AI-generated side-by-side competitor analysis with strengths/weaknesses",
  ],
  [
    "AEO Audit",
    "Site readiness check: llms.txt, Schema.org, BLUF density, heading structure",
  ],
  [
    "SRO Analysis",
    "Deep pipeline: Cross-Platform Citations → SERP → Page Scraping → Site Context → LLM Analysis (Gemini Grounding runs in the bulk-sro API). Produces SRO Score (0 to 100), prioritized recommendations, content gaps & competitor insights",
  ],
  ["Automation", "Cron / GitHub Actions templates for scheduled runs"],
  ["Documentation", "Searchable 18-section guide covering every feature"],
];

const CAPABILITIES = [
  "Multi-model tracking across ChatGPT, Perplexity, Gemini, Copilot, and Google AI Mode",
  'Geo-scoped tracking: run visibility checks by country and compare markets, with a "visibility by country" breakdown',
  "SRO Analysis: multi-stage pipeline scoring how well your page is optimized for AI search results",
  "Rank Signal: paired A/B tests inside the SRO tab that measure whether one text feature (a number, a named source, a freshness clause) changes which passage a model picks",
  "Visibility scoring (0 to 100): brand mentions, position, frequency, citations, sentiment",
  "Drift alerts: automatic notifications when your score changes significantly",
  "Scheduled auto-runs: configurable interval-based batch scraping",
  "Batch runs: every prompt × engine combo, 4 at a time to stay inside the rate limit",
  "Historical comparison: delta tracking across time periods",
  "Multi-workspace: manage multiple brands/projects independently",
  "Dark/light/system theme with a polished sidebar UI",
  "Mobile-responsive: collapsible sidebar with hamburger menu, adaptive KPI grid, and scrollable model toolbar",
];

const API_ROUTES: Array<[string, string, string, string]> = [
  [
    "POST /api/scrape",
    "scrape",
    "Node.js",
    "Bright Data AI Scrapers, query AI models for brand mentions",
  ],
  [
    "POST /api/analyze",
    "analyze",
    "Node.js",
    "OpenRouter LLM inference, battlecards, niche queries",
  ],
  [
    "POST /api/audit",
    "audit",
    "Node.js",
    "AEO site audit: llms.txt, schema, BLUF, heading checks",
  ],
  [
    "POST /api/sro-analyze",
    "sro-analyze",
    "Node.js",
    "SRO final analysis, synthesizes all data into score + recommendations",
  ],
  [
    "POST /api/serp",
    "serp",
    "Node.js",
    "Bright Data SERP, organic search results for a keyword",
  ],
  [
    "POST /api/site-context",
    "site-context",
    "Node.js",
    "Homepage scrape + context extraction via OpenRouter",
  ],
  [
    "POST /api/unlocker",
    "unlocker",
    "Node.js",
    "Bright Data Web Unlocker, single or batch URL scraping",
  ],
  [
    "POST /api/brightdata-platforms",
    "brightdata-platforms",
    "Node.js",
    "5-platform AI citation polling via Bright Data datasets",
  ],
  [
    "POST /api/bulk-sro",
    "bulk-sro",
    "Node.js",
    "SSE streaming, bulk SRO analysis across multiple keywords",
  ],
  [
    "POST /api/rank-signal",
    "rank-signal",
    "Node.js",
    "SSE streaming, Rank Signal paired A/B trials for one signal (GET returns signals and allowed judge models)",
  ],
  [
    "GET/PUT/DELETE /api/state",
    "state",
    "Node.js",
    "Cloud KV store proxy, reads/writes to Supabase using service-role key (disabled when cloud not configured)",
  ],
];

const TECH_STACK: Array<[string, string]> = [
  ["Framework", "Next.js 16 + Turbopack"],
  ["Language", "TypeScript (strict)"],
  ["Styling", "Tailwind CSS v4 with `@theme inline`"],
  ["Charts", "Recharts"],
  ["Validation", "Zod"],
  [
    "Storage",
    "IndexedDB (idb-keyval) + localStorage, optional Supabase cloud sync",
  ],
  ["AI Scraping", "Bright Data Web Scraper API"],
  ["LLM Inference", "OpenRouter (Gemini Flash)"],
  ["SRO Grounding", "Google Gemini API (`@google/genai`)"],
  ["SERP Data", "Bright Data SERP API"],
  ["Web Scraping", "Bright Data Web Unlocker"],
  ["Deployment", "Vercel"],
];

export function llmsTxt(origin: string): string {
  const routes = API_ROUTES.map(
    ([sig, dir, , purpose]) =>
      `- [${sig}](${REPO_BLOB}/app/api/${dir}/route.ts): ${purpose}`,
  );
  return [
    "# GEO/AEO Tracker",
    "",
    `> ${SUMMARY}`,
    "",
    "## Project",
    "",
    `- [GitHub repository](${REPO_URL}): source code, issues and releases`,
    `- [README](${REPO_BLOB}/README.md): features, architecture, quick start and deployment`,
    `- [AGENTS.md](${REPO_BLOB}/AGENTS.md): instructions for coding agents working in the repository`,
    `- [License](${REPO_BLOB}/LICENSE): MIT`,
    "",
    "## Live demo",
    "",
    `- [Demo dashboard](${origin}/demo): read-only preview with sample data`,
    `- [Full product description](${origin}/llms-full.txt): features, quick start, environment variables, API routes and tech stack`,
    "",
    "## API routes",
    "",
    ...routes,
    "",
    "## Optional",
    "",
    `- [Sitemap](${origin}/sitemap.xml)`,
    "",
  ].join("\n");
}

export function llmsFullTxt(origin: string): string {
  const table = (head: [string, string], rows: Array<[string, string]>) => [
    `| ${head[0]} | ${head[1]} |`,
    "|---|---|",
    ...rows.map(([a, b]) => `| ${a} | ${b} |`),
  ];
  return [
    "# GEO/AEO Tracker",
    "",
    `> ${SUMMARY}`,
    "",
    "GEO/AEO Tracker is a dashboard that shows whether AI models mention your brand. It sends prompts you write to 5 AI models (ChatGPT, Perplexity, Gemini, Copilot and Google AI Mode) and scores your visibility from 0 to 100 from brand mentions, position, frequency, citations and sentiment. It is for marketers, SEO leads and founders who want GEO and AEO (generative and answer engine optimization) data. You run it yourself with your own API keys and results stay in your browser by default. The software is free under the MIT license. You pay Bright Data, OpenRouter and Gemini only for the calls you make.",
    "",
    `Source: ${REPO_URL} (MIT license). Live demo: ${origin}/demo`,
    "",
    "## Why",
    "",
    "AI models are replacing traditional search for millions of queries. If your brand isn't visible in ChatGPT, Perplexity, or Gemini responses, you're invisible to a growing audience.",
    "",
    "- BYOK (Bring Your Own Keys): results are stored in your browser by default",
    "- 5 AI models tracked in parallel",
    "- Free MIT-licensed software: you pay only the API providers, per call",
    "- Local-first by default: IndexedDB + localStorage, no external database",
    "- Optional cloud sync via your own Supabase project (free tier) for multi-device access",
    "",
    "## Features",
    "",
    "13 feature tabs:",
    "",
    ...table(["Tab", "What it does"], FEATURE_TABS),
    "",
    "Core capabilities:",
    "",
    ...CAPABILITIES.map((c) => `- ${c}`),
    "",
    "## Quick start",
    "",
    "Prerequisites: Node.js 20.9+, a Bright Data API key with AI Scraper dataset IDs, and an OpenRouter API key. Every variable is optional: the app builds, boots and deploys with an empty .env and shows the sample dataset instead of live data.",
    "",
    "```bash",
    "git clone https://github.com/danishashko/geo-aeo-tracker.git",
    "cd geo-aeo-tracker",
    "npm install",
    "cp .env.example .env",
    "npm run dev",
    "```",
    "",
    "Open http://localhost:3000. Validate the setup with `npm run test:scraper`, `npm run build` and `npm run lint`.",
    "",
    "Deploy to Vercel with zero configuration. The deployment lands on a working dashboard running the sample dataset. Add keys afterwards to switch it to live data.",
    "",
    "## Environment variables",
    "",
    "- `BRIGHT_DATA_KEY`: switches on live AI-engine tracking. With no key the dashboard loads the sample dataset and tells you so in a banner.",
    "- `OPENROUTER_KEY`: powers LLM analysis (`/api/analyze`, `/api/sro-analyze`, `/api/site-context`). Without it, scraping still works and the analysis panels report that they are not configured. Override the model with `OPENROUTER_MODEL` (default `google/gemini-3.5-flash`).",
    "- `GEMINI_API_KEY`: separate from OpenRouter. It powers only the Gemini grounding stage of the bulk-sro API, which uses Google Search grounding to see which pages Gemini actually cites in real time. A missing key skips that stage and the rest of the SRO pipeline runs.",
    "- `BRIGHT_DATA_DATASET_*`: not needed. The app ships with Bright Data's public AI-Scraper dataset ID for every engine. Set one only to point an engine at a custom or private dataset.",
    "- `BRIGHT_DATA_SERP_ZONE` and `BRIGHT_DATA_UNLOCKER_ZONE`: zone names for the SRO pipeline. They default to `serp_api1` and `web_unlocker1`.",
    "- `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_CLOUD_STORAGE_ENABLED=true` and `STATE_SYNC_SECRET`: optional Supabase cloud sync. `STATE_SYNC_SECRET` is required when cloud sync is enabled, otherwise `/api/state` rejects every request.",
    "- `NEXT_PUBLIC_DEMO_ONLY=true`: deploys a read-only preview with sample data and no live API calls.",
    "- `NEXT_PUBLIC_SITE_URL`: the public origin of the deployment, used for the sitemap and metadata.",
    "",
    "## API routes",
    "",
    ...table(
      ["Route", "Runtime / Purpose"],
      API_ROUTES.map(([sig, , runtime, purpose]): [string, string] => [
        `\`${sig}\``,
        `${runtime}. ${purpose}`,
      ]),
    ),
    "",
    "All routes include input validation and error handling. Most routes use in-memory caching to minimize API costs.",
    "",
    "## Tech stack",
    "",
    ...table(["Layer", "Technology"], TECH_STACK),
    "",
    "## Links",
    "",
    `- GitHub: ${REPO_URL}`,
    `- README: ${REPO_BLOB}/README.md`,
    `- AGENTS.md: ${REPO_BLOB}/AGENTS.md`,
    `- License (MIT): ${REPO_BLOB}/LICENSE`,
    `- Live demo: ${origin}/demo`,
    "",
  ].join("\n");
}
