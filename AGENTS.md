# AGENTS.md

GEO/AEO Tracker measures how often AI answer engines (ChatGPT, Perplexity, Copilot, Gemini, Google AI Mode) mention and cite a brand. It is a Next.js 16 App Router app on React 19 and TypeScript, styled with Tailwind 4, with zod for request validation and Recharts for charts. State lives in the browser (idb-keyval over IndexedDB) by default, with optional Supabase sync. MIT licensed. The package name is `llm-tracker`.

## Setup and commands

```bash
npm install
cp .env.example .env     # every variable is optional
npm run dev              # http://localhost:3000
```

| Command | What it does | Needs keys / costs money |
|---|---|---|
| `npm run dev` | Next dev server (Turbopack) | No. An empty env shows the demo dataset |
| `npm run build` | Production build | No. `NEXT_PUBLIC_*` vars are inlined here |
| `npm run start` | Serve the production build | No |
| `npm test` | `tsx --test "lib/**/*.test.ts"` (Node test runner, about 140 tests across `lib/`, `lib/client`, `lib/server` and `lib/shared`) | No, offline |
| `npm run lint` | ESLint (`eslint.config.mjs`, next core-web-vitals + typescript) | No. Currently 0 errors, 8 warnings |
| `npm run test:pillar -- 8` | Checks that the files for a pillar number (1 to 8) exist | No, offline |
| `npm run test:scraper` | One live Bright Data AI-scraper call | Yes, bills Bright Data |

Free type check: `npx tsc --noEmit` (passes clean).

Tests go in `lib/**/*.test.ts` and use `node:test` through `tsx`. Also run `npx tsc --noEmit`, `npm run lint` and `npm run build`.

## Environment variables

Source of truth: `.env.example`. All are optional. The app builds and boots with an empty `.env`.

| Variable | Used by | Without it |
|---|---|---|
| `BRIGHT_DATA_KEY` | all scraping routes, `app/page.tsx` | Home page switches to demo data. Scrape routes return errors. **Bills Bright Data** |
| `OPENROUTER_KEY` | `app/api/analyze/route.ts`, `app/api/site-context/route.ts`, `lib/server/openrouter-sro.ts` | Analysis panels show "not configured". Scraping still works. **Bills OpenRouter** |
| `OPENROUTER_MODEL` | same files | Defaults to `google/gemini-3.5-flash` |
| `GEMINI_API_KEY` | `lib/server/gemini-grounding.ts` | Only the SRO grounding stage is skipped. **Bills Google** |
| `BRIGHT_DATA_SERP_ZONE` | `lib/server/serp.ts` | Defaults to `serp_api1` |
| `BRIGHT_DATA_UNLOCKER_ZONE` | `lib/server/unlocker.ts` | Defaults to `web_unlocker1` |
| `BRIGHT_DATA_DATASET_CHATGPT`, `_PERPLEXITY`, `_COPILOT`, `_GEMINI`, `_GOOGLE_AI` | `lib/server/brightdata-scraper.ts`, `lib/server/brightdata-platforms.ts` | Public default dataset IDs ship in code. Override only for private datasets |
| `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` | `lib/server/supabase.ts` | Cloud sync off |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/server/supabase.ts` | Cloud sync off. Server only, never expose |
| `NEXT_PUBLIC_CLOUD_STORAGE_ENABLED` | `lib/client/cloud-mode.ts` | Client hides the sync toggle. Inlined at build |
| `STATE_SYNC_SECRET` | `app/api/state/route.ts` | The route answers 503 |
| `NEXT_PUBLIC_DEMO_ONLY` | `app/page.tsx` | `true` forces the read-only demo. Inlined at build |

Never commit `.env`. `.gitignore` excludes `.env*` except `.env.example`.

## Architecture

- `app/page.tsx`: home. Picks demo or live mode on the server and renders `SovereignDashboard`.
- `app/demo/page.tsx`: always-demo route.
- `components/sovereign-dashboard.tsx`: the client shell. Holds app state, tab switching and run orchestration (a very large file).
- `components/dashboard/types.ts`: shared types, `ALL_PROVIDERS`, `PROVIDER_LABELS`, `COUNTRIES`, the `tabs` list.
- `components/dashboard/tabs/`: one file per dashboard tab.
- `lib/server/`: server-only code. Bright Data scrapers, SERP, Unlocker, OpenRouter SRO, Gemini grounding, `ssrf.ts`, `http.ts`, Supabase KV.
- `lib/client/`: `sovereign-store.ts` (IndexedDB persistence with cloud fallback) and `cloud-mode.ts`.
- `lib/demo-data.ts`: the sample dataset used in demo mode.
- `supabase/migrations/001_kv_store.sql`: the single `kv_store` table for cloud sync.
- `scripts/`: the two plain-Node scripts behind `test:scraper` and `test:pillar`.
- `proxy.ts`: IP rate limiting on `/api/*`, plus markdown negotiation and Link headers on `/` and `/demo` for demo deploys. On demo deploys (`NEXT_PUBLIC_DEMO_ONLY=true`) every `/api/*` request gets a 403 before any route runs.
- `lib/shared/`: pure code used by client and server (`rank-signal-stats.ts`, `strip-markdown.ts`). `lib/server/rank-signal*.ts`: the Rank Signal pipeline behind `app/api/rank-signal/route.ts`.
- `lib/agent-discovery.ts`: single source for `robots.txt`, `sitemap.xml`, `llms.txt`, `llms-full.txt` and `/index.md`. Served only when `NEXT_PUBLIC_DEMO_ONLY=true`; private deploys get `Disallow: /` and 404s. Edit the copy here, never in the route files.

### API routes

All routes are unauthenticated except `state`. Limits are requests per IP per path per minute from `proxy.ts`. Paths not listed there get 30. The client IP is `x-vercel-forwarded-for`, then `x-real-ip`, then the last `x-forwarded-for` hop. On demo deploys none of these routes answer (403).

| File | Method | Purpose | Limit | Bills |
|---|---|---|---|---|
| `app/api/scrape/route.ts` | POST | One AI engine query via a Bright Data dataset | 20 | Bright Data |
| `app/api/brightdata-platforms/route.ts` | POST | Query all engines, or one platform, for a keyword | 12 | Bright Data |
| `app/api/bulk-sro/route.ts` | POST | Full SRO pipeline, streamed as server-sent events | 4 | Every vendor |
| `app/api/sro-analyze/route.ts` | POST | SRO scoring from prior stage output | 20 | OpenRouter |
| `app/api/analyze/route.ts` | POST | Generic LLM prompt (scoring, battlecards), `maxDuration` 120. A client `model` is ignored unless it equals `OPENROUTER_MODEL` or the code default. Prompt capped at 20,000 chars, `maxTokens` at 2000 | 30 | OpenRouter |
| `app/api/site-context/route.ts` | POST | Scrape a site and summarize its context | 30 | Bright Data, OpenRouter |
| `app/api/serp/route.ts` | POST | Google SERP for a keyword | 30 | Bright Data |
| `app/api/unlocker/route.ts` | POST | Fetch one URL, or up to 5, through Web Unlocker. Every URL passes `assertPublicHttpUrl` | 30 | Bright Data |
| `app/api/rank-signal/route.ts` | GET, POST | Rank Signal paired A/B trials for one signal, streamed as server-sent events. GET lists signals and allowed judge models. `maxDuration` 300 | 6 | OpenRouter, Bright Data |
| `app/api/audit/route.ts` | POST | AEO page audit, fetches the page directly | 30 | Nothing |
| `app/api/state/route.ts` | GET, PUT, DELETE | Cloud KV sync, needs the `x-sync-secret` header | 30 | Supabase |

## Conventions

- **Next 16 uses `proxy.ts`, not `middleware.ts`.** Export a function named `proxy` and a `config.matcher`. Do not create `middleware.ts`.
- **Demo mode.** `app/page.tsx` sets demo when `NEXT_PUBLIC_DEMO_ONLY` is `true` or `BRIGHT_DATA_KEY` is empty. In `components/sovereign-dashboard.tsx`, `demoMode` skips workspace load and save. Changing the flag needs a rebuild.
- **Local-first.** No server database by default. Read and write app state through `loadSovereignValue` and `saveSovereignValue` in `lib/client/sovereign-store.ts`. Do not call `/api/state` directly from tabs.
- **Validation.** Every route defines a zod schema at the top and parses the body before doing work. Follow that shape. Cap array sizes and string lengths for anything that reaches an LLM prompt (see `app/api/sro-analyze/route.ts`).
- **Outbound calls.** Use `fetchWithTimeout` or `withTimeout` from `lib/server/http.ts`. Every upstream call needs a deadline.
- **User-supplied URLs fetched server-side** must pass `assertPublicHttpUrl` from `lib/server/ssrf.ts`.
- **Path alias.** `@/` maps to the repo root (`tsconfig.json`).
- **Server and client split.** Anything reading a secret stays in `lib/server/` or a route. Client files start with `"use client"`.
- **Rate limits.** A new route gets the default 30 per minute. Add an entry to `LIMITS` in `proxy.ts` if it calls a paid API.

### Add an AI engine

1. Extend `Provider`, `ALL_PROVIDERS` and `PROVIDER_LABELS` in `components/dashboard/types.ts`.
2. Add it to the `z.enum` in `app/api/scrape/route.ts`, and to `ProviderSchema` and `providerToDatasetEnv` in `lib/server/brightdata-scraper.ts`, with a default dataset ID.
3. Add an entry to `PLATFORMS` in `lib/server/brightdata-platforms.ts`.
4. Update `lib/demo-data.ts`, `components/dashboard/tabs/visibility-analytics-tab.tsx` and `components/dashboard/tabs/reputation-sources-tab.tsx`, which key on engine names.
5. Add the dataset env var to `.env.example`.

Grok was removed in v1.5.0 because its Bright Data scraper never completes (`CHANGELOG.md`). Do not re-add it without testing.

### Add a tab

1. Append the name to `tabs` in `components/dashboard/types.ts`.
2. Add entries to `tabIcons` and `tabMeta` in `components/sovereign-dashboard.tsx`.
3. Create the component in `components/dashboard/tabs/` and add a branch in `renderActiveTab` in the same shell file.

## Testing guidance

- Free and offline: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test:pillar -- <1-8>`.
- Paid: `npm run test:scraper` with keys, and any request to `/api/scrape`, `/api/brightdata-platforms`, `/api/bulk-sro`, `/api/serp`, `/api/unlocker`, `/api/site-context`, `/api/analyze` or `/api/sro-analyze`.
- Never run paid calls without the user's keys and explicit consent. `bulk-sro` fans out to every vendor in one request.
- UI changes need a look in a real browser at `npm run dev`. Use `/demo` for a no-key check.

## Gotchas

- `scripts/test-scraper.js` still lists a Grok engine and only goes live when a `BRIGHT_DATA_DATASET_*` var is set. Dataset IDs now have defaults in code, so with only `BRIGHT_DATA_KEY` set it prints a mock result.
- `npm run test:scraper` uses `node --env-file=.env`, so it exits with "node: .env: not found" when no `.env` exists.
- `NEXT_PUBLIC_DEMO_ONLY` changes what `app/page.tsx` renders, and `proxy.ts` answers 403 to every `/api/*` request on such a deploy, so keys on a demo deploy are never used. The flag is inlined at build, so changing it needs a rebuild.
- `proxy.ts` keeps its counters in process memory. Off Vercel a client can still send its own `x-real-ip` when no proxy overwrites it, so the limit is best-effort. On serverless each instance counts alone, so the limit stops bursts and nothing more.
- `scripts/*.js` is excluded from ESLint in `eslint.config.mjs`.
- `lib/server/brightdata-scraper.ts` waits 90 seconds and follows a `snapshot_id` handoff. Keep that timeout, since Gemini and Copilot need it.
- `app/api/bulk-sro/route.ts` streams `text/event-stream`. Keep the response shape when editing it.
- The cloud sync secret is entered in the UI and stored per browser (`lib/client/cloud-mode.ts`). It never ships in the bundle.
- `vercel.json` holds only a schema line. Vercel needs no extra config.
