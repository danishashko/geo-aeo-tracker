<p align="center">
  <img src="public/banner.svg" alt="GEO/AEO Tracker – Open-source AI visibility dashboard" width="100%"/>
</p>

<p align="center">
  <a href="https://brightdata.com/?utm_source=geo-tracker-os"><img src="https://img.shields.io/badge/Powered%20by-Bright%20Data-00d4aa?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIgZmlsbD0id2hpdGUiLz48L3N2Zz4=" alt="Powered by Bright Data"/></a>
  <a href="https://geo-aeo-tracker-wine.vercel.app"><img src="https://img.shields.io/badge/Live%20Demo-▶-blue?style=for-the-badge" alt="Live Demo"/></a>
  <a href="#deploy-to-vercel"><img src="https://img.shields.io/badge/Deploy-Vercel-black?style=for-the-badge&logo=vercel" alt="Deploy to Vercel"/></a>
</p>

<h1 align="center">GEO/AEO Tracker</h1>

<p align="center">
  Open-source, local-first AI visibility intelligence dashboard.<br/>
  Track your brand across <strong>5 AI engines</strong> with zero vendor lock-in.<br/>
  Now with <strong>SRO Analysis</strong> — deep cross-platform search result optimization.<br/>
  <strong>Mobile-responsive</strong> — works seamlessly on desktop, tablet, and phone.
</p>

<p align="center">
  <a href="#features"><strong>Features</strong></a> · 
  <a href="#quick-start"><strong>Quick Start</strong></a> · 
  <a href="#deploy-to-vercel"><strong>Deploy</strong></a> · 
  <a href="#-optional-cloud-persistence-with-supabase"><strong>Cloud Sync</strong></a> · 
  <a href="#api-routes"><strong>API</strong></a>
</p>

---

> 🌐 **Built with [Bright Data](https://brightdata.com/?utm_source=geo-tracker-os)** — the world's leading web data platform.
> GEO/AEO Tracker uses Bright Data's AI Scraper API to reliably collect structured responses from 5 AI engines.
> [Get your API key →](https://brightdata.com/?utm_source=geo-tracker-os)

---

## Why

AI models are replacing traditional search for millions of queries. If your brand isn't visible in ChatGPT, Perplexity, or Gemini responses, you're invisible to a growing audience.

Existing tools charge **$200–$500+/month**, lock you into closed ecosystems, and store your data on their servers.

**GEO/AEO Tracker** is the alternative:

- 🔑 **BYOK** (Bring Your Own Keys): your data never leaves your machine
- 🤖 **5 AI engines** simultaneously: more coverage than paid tools
- 💸 **$0/month**: self-hosted, open-source, forever free
- 🛡️ **Local-first** by default: IndexedDB + localStorage, no external database
- ☁️ **Optional cloud sync** via your own Supabase project (free tier) for multi-device access

## Features

### 📋 13 Feature Tabs

| Tab | What it does |
|-----|-------------|
| ⚙️ **Project Settings** | Brand name, aliases, website, industry, keywords, description |
| 💬 **Prompt Hub** | Manage tracking prompts with `{brand}` injection. Run single or batch across models in parallel |
| 🎭 **Persona Fan-Out** | Generate persona-specific prompt variants (CMO, SEO Lead, Founder, etc.) |
| 🔍 **Niche Explorer** | AI-generated high-intent queries for your niche |
| 📝 **Responses** | Browse AI responses with brand/competitor highlighting, filters, and search |
| 📊 **Visibility Analytics** | Score trends over time via Recharts line charts. CSV export |
| 🔗 **Citations** | Domain-grouped citation frequency analysis |
| 🎯 **Citation Opportunities** | URLs where competitors get cited but you don't, with outreach briefs |
| ⚔️ **Competitor Battlecards** | AI-generated side-by-side competitor analysis with strengths/weaknesses |
| 🏥 **AEO Audit** | Site readiness check: llms.txt, AI crawler access (robots.txt), Schema.org, BLUF density, heading structure |
| 📡 **SRO Analysis** | 6-stage deep pipeline: Gemini Grounding → Cross-Platform Citations → SERP → Page Scraping → Site Context → LLM Analysis. Produces SRO Score (0–100), prioritized recommendations, content gaps & competitor insights |
| ⏱️ **Automation** | Cron / GitHub Actions templates for scheduled runs |
| 📖 **Documentation** | Searchable 18-section guide covering every feature |

### 🚀 Core Capabilities

- 🤖 **Multi-model tracking** across ChatGPT, Perplexity, Gemini, Copilot, and Google AI Mode
- 🌍 **Geo-scoped tracking**: run visibility checks by country and compare markets, with a "visibility by country" breakdown
- � **SRO Analysis**: 6-stage pipeline scoring how well your page is optimized for AI search results
- 📈 **Visibility scoring** (0–100): brand mentions, position, frequency, citations, sentiment
- 🔔 **Drift alerts**: automatic notifications when your score changes significantly
- ⏰ **Scheduled auto-runs**: configurable interval-based batch scraping
- 🚀 **Fully parallel batch runs**: all prompt × provider combos execute simultaneously
- 📅 **Historical comparison**: delta tracking across time periods
- 🏢 **Multi-workspace**: manage multiple brands/projects independently
- 🎨 **Dark/light/system** theme with a polished sidebar UI
- 📱 **Mobile-responsive**: collapsible sidebar with hamburger menu, adaptive KPI grid, and scrollable model toolbar — works on any screen size

## Architecture

```
Next.js 16.1 + Turbopack
├── app/
│   ├── page.tsx                    # Main dashboard (or demo via env var)
│   ├── demo/page.tsx               # Standalone demo route
│   └── api/
│       ├── scrape/route.ts         # Bright Data AI Scrapers (Node runtime)
│       ├── analyze/route.ts        # OpenRouter LLM analysis (Edge runtime)
│       ├── audit/route.ts          # AEO site audit crawler
│       ├── sro-analyze/route.ts    # SRO final LLM analysis
│       ├── serp/route.ts           # Bright Data SERP results
│       ├── site-context/route.ts   # Homepage context extraction
│       ├── unlocker/route.ts       # Bright Data Web Unlocker (single/batch)
│       ├── brightdata-platforms/   # 5-platform AI citation polling
│       ├── bulk-sro/route.ts       # SSE bulk SRO analysis
│       └── state/route.ts          # Cloud KV store (GET/PUT/DELETE — Node runtime)
├── components/
│   ├── sovereign-dashboard.tsx     # Main shell — state, tabs, KPIs
│   └── dashboard/
│       ├── types.ts                # AppState, ScrapeRun, Provider, etc.
│       └── tabs/                   # 13 tab components
├── lib/
│   ├── client/
│   │   ├── sovereign-store.ts      # Storage API — IDB default, cloud when configured
│   │   └── cloud-mode.ts           # isCloudActive / isCloudAvailable helpers
│   ├── server/
│   │   ├── supabase.ts             # Server-side Supabase singleton (service_role)
│   │   ├── kv-store.ts             # kvGet / kvSet / kvDelete helpers
│   │   ├── brightdata-scraper.ts   # Bright Data AI Scraper integration
│   │   ├── brightdata-platforms.ts # 5-platform citation scraper
│   │   ├── gemini-grounding.ts     # Gemini Grounding via Google Search
│   │   ├── openrouter-sro.ts       # SRO analysis via OpenRouter
│   │   ├── serp.ts                 # SERP data via Bright Data
│   │   ├── sro-types.ts            # SRO type definitions
│   │   └── unlocker.ts             # Web Unlocker scraping
│   └── demo-data.ts                # Deterministic seed data for demo mode
├── supabase/
│   └── migrations/
│       └── 001_kv_store.sql        # kv_store table + updated_at trigger
└── scripts/
    ├── test-scraper.js             # API validation script
    └── test-pillar.js              # Feature pillar tests
```

**Key decisions:**
- **IndexedDB** primary store (no size limit) with localStorage as best-effort cache; same public API whether cloud is active or not
- **Cloud storage routes through `/api/state`** — the client never calls Supabase directly, so `service_role` stays server-side and RLS isn't a concern
- **Auto-opt-in cloud**: when `NEXT_PUBLIC_CLOUD_STORAGE_ENABLED=true` the IDB write path becomes a cache; IDB is the authoritative fallback if the cloud route fails
- **Edge runtime** for `/api/analyze` (Gemini Flash via OpenRouter) — fast global inference
- **Bright Data Web Scraper API** for AI model scraping — reliable, structured data
- **Bright Data SERP + Web Unlocker** for SRO pipeline data gathering
- **Google Gemini API** for grounding analysis in SRO pipeline
- **Zod** schema validation on all API routes
- **Recharts** for analytics visualizations
- **Tailwind CSS v4** with CSS custom properties for theming

## Quick Start

### Prerequisites

- Node.js 18+
- [Bright Data](https://brightdata.com/) API key + AI Scraper dataset IDs
- [OpenRouter](https://openrouter.ai/) API key

### Install & Run

```bash
git clone https://github.com/danishashko/geo-aeo-tracker.git
cd geo-aeo-tracker
npm install
```

Copy the template and fill in your keys. Every variable is documented inline in `.env.example`:

```bash
cp .env.example .env
```

**Every variable is optional.** The app builds, boots, and deploys with an empty `.env` — you just get the sample dataset instead of live data. Add one key at a time to switch features on; nothing else breaks when one is missing.

#### What each variable does

- **`BRIGHT_DATA_KEY`** — unlocks live AI-engine tracking. This is the one that matters: with no key the dashboard loads the sample dataset and tells you so in a banner. Add it and the same dashboard goes live.
- **`OPENROUTER_KEY`** — powers LLM analysis (`/api/analyze`, `/api/sro-analyze`, `/api/site-context`). Without it, scraping still works and the analysis panels report that they are not configured. Model override via `OPENROUTER_MODEL` (default `google/gemini-3.5-flash`).
- **`GEMINI_API_KEY`** — **separate from OpenRouter.** It powers only the Gemini *grounding* stage, which uses Google Search grounding to see which pages Gemini actually cites in real time. OpenRouter can't do that, which is why it is its own key. Missing key skips that one stage; the rest of the SRO pipeline runs.
- **`BRIGHT_DATA_DATASET_*`** — **you don't need these.** The app ships with Bright Data's public AI-Scraper dataset ID for every engine. Set one only to point an engine at a custom or private dataset from the [Scrapers Library](https://brightdata.com/cp/scrapers).
- **`BRIGHT_DATA_SERP_ZONE`** / **`BRIGHT_DATA_UNLOCKER_ZONE`** — zone **names** for the SRO pipeline. They default to `serp_api1` and `web_unlocker1`, the names Bright Data's own docs use, so most accounts work untouched. Set them if you named your zones differently.

Supabase cloud-sync and demo-mode variables are documented in `.env.example`.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Validate Setup

```bash
npm test                # Unit tests (robots.txt parser)
npm run test:scraper    # Test Bright Data API connection
npm run build           # Full production build check
npm run lint            # ESLint
```

## Deploy to Vercel

> ✅ **Deploys with zero configuration.** No keys are requested during setup. The deployment lands on a working dashboard running the sample dataset, and you add keys afterwards to switch it to live data.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdanishashko%2Fgeo-aeo-tracker)

1. Click the button above (or run `vercel --prod` from your clone)
2. Wait for the build. You now have a live URL showing the sample dashboard
3. To track real engines, go to **Project Settings → Environment Variables**, add `BRIGHT_DATA_KEY` (and `OPENROUTER_KEY` for the analysis layer), then redeploy

Step 3 is genuinely optional. If you only wanted to look around, stop after step 2.

### 🧪 Demo-Only Mode (optional)

Want to deploy a read-only preview with sample data and no API keys?

1. Add env var `NEXT_PUBLIC_DEMO_ONLY` = `true` in Vercel → Project Settings → Environment Variables
2. Redeploy. The dashboard will load with pre-generated demo data instead of making live API calls

### ☁️ Optional: Cloud persistence with Supabase

By default, **all your data stays in your browser** (IndexedDB). That's great for a single device, but if you want your runs, prompts, and settings to persist across devices — or survive clearing browser data — you can plug in a free Supabase project.

**Why it's optional**
- Local-first still works 100% without Supabase.
- When enabled, the client never talks to Supabase directly. Every read/write goes through a server-side Next.js route using your service-role key, so your key stays private and RLS is a non-issue.
- You can toggle cloud sync on/off per-browser from **Project Settings → Cloud Sync**.

**Setup (5 minutes)**

1. Create a free project at [supabase.com](https://supabase.com/).
2. In the Supabase SQL editor, paste and run `supabase/migrations/001_kv_store.sql` from this repo. This creates a single `kv_store` table with RLS enabled.
3. In Supabase → **Project Settings → API**, grab:
   - `Project URL` → `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL` — either is accepted)
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY`
4. In Vercel → **Project Settings → Environment Variables**, add:

   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   NEXT_PUBLIC_CLOUD_STORAGE_ENABLED=true

   # Shared secret that authenticates the cloud sync API. Generate a long
   # random string (e.g. `openssl rand -hex 24`). REQUIRED when cloud sync is
   # enabled — without it the /api/state route rejects every request.
   STATE_SYNC_SECRET=your_long_random_secret
   ```

5. Redeploy. Open **Project Settings → Cloud Sync**, enable it, and paste the
   same `STATE_SYNC_SECRET` value into the **Sync passphrase** field. This is
   what keeps your KV store private: the API denies any request without it, so
   the secret never ships in the client bundle.

**Free tier caveats** (always check [supabase.com/pricing](https://supabase.com/pricing) for current limits)
- Free tier includes a generous Postgres database, but projects pause after a week of inactivity on the free plan — first request after a pause may be slow.
- The `service_role` key has full DB access — keep it server-side only (Vercel env vars are fine; never commit it).
- Single-tenant by design: one deployment = one Supabase project = your data. If you want multi-user auth, you'll need to extend the schema with a user_id column + RLS policies.

**What gets synced**
- All app state keyed by workspace (`sovereign-aeo-tracker-*`) — runs, prompts, settings, SRO results.
- NOT synced (kept local on purpose): theme preference, workspace list, active workspace — these are per-device UI choices.

## API Routes

| Route | Runtime | Purpose |
|-------|---------|---------|
| `POST /api/scrape` | Node.js | Bright Data AI Scrapers — query AI models for brand mentions |
| `POST /api/analyze` | Edge | OpenRouter LLM inference — battlecards, niche queries |
| `POST /api/audit` | Node.js | AEO site audit — llms.txt, schema, BLUF, heading checks |
| `POST /api/sro-analyze` | Node.js | SRO final analysis — synthesizes all data into score + recommendations |
| `POST /api/serp` | Node.js | Bright Data SERP — organic search results for a keyword |
| `POST /api/site-context` | Node.js | Homepage scrape + context extraction via OpenRouter |
| `POST /api/unlocker` | Node.js | Bright Data Web Unlocker — single or batch URL scraping |
| `POST /api/brightdata-platforms` | Node.js | 5-platform AI citation polling via Bright Data datasets |
| `POST /api/bulk-sro` | Node.js | SSE streaming — bulk SRO analysis across multiple keywords |
| `GET/PUT/DELETE /api/state` | Node.js | Cloud KV store proxy — reads/writes to Supabase using service-role key (disabled when cloud not configured) |

All routes include input validation and error handling. Most routes use in-memory caching to minimize API costs.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.1 + Turbopack |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 with `@theme inline` |
| Charts | Recharts |
| Validation | Zod |
| Storage | IndexedDB (idb-keyval) + localStorage, optional Supabase cloud sync |
| AI Scraping | Bright Data Web Scraper API |
| LLM Inference | OpenRouter (Gemini Flash) |
| SRO Grounding | Google Gemini API (`@google/genai`) |
| SERP Data | Bright Data SERP API |
| Web Scraping | Bright Data Web Unlocker |
| Deployment | Vercel |

## License

MIT — use it, fork it, ship it.

---

<p align="center">
  Built by <a href="https://www.linkedin.com/in/daniel-shashko/">Daniel Shashko</a><br/>
  <sub>Powered by <a href="https://brightdata.com/?utm_source=geo-tracker-os">Bright Data</a></sub>
</p>
