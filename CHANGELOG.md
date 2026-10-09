# Changelog

All notable changes to GEO/AEO Tracker are documented here.

---

## [1.5.1] — 2026-10-09

### 🐛 Fix: AEO Audit's AI crawler check now reads robots.txt correctly

- The old check used one regex per bot and got common files wrong: an `Allow: /` for GPTBot followed by any `Disallow: /something` in another group reported GPTBot as blocked, a site-wide `User-agent: *` / `Disallow: /` reported every bot as allowed, and a missing robots.txt failed the check even though it means "crawl everything".
- Replaced with an RFC 9309 parser (`lib/server/robots.ts`): per-agent groups with `*` fallback, longest match with Allow winning ties, `*` and `$` wildcards. It checks the audited page's own path, not just `/`.
- Crawlers are split by what blocking them costs. The check fails only when an **answer-engine** crawler is blocked (OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User, Claude-SearchBot, Claude-User, Googlebot, Google-Extended, Bingbot). Training-only crawlers (GPTBot, ClaudeBot, Applebot-Extended, Meta-ExternalAgent, CCBot, Bytespider) are listed but don't fail it, since opting out of training doesn't remove you from AI answers. Dropped the retired `anthropic-ai` token.
- An unreachable robots.txt (5xx / network error) is now reported as such instead of guessed at.
- Added `npm test` with unit tests for the parser (Node's built-in test runner, no new dependencies).

### 📝 Engine count cleanup after the Grok removal

- README, in-app docs, banner and SRO demo copy said "6 AI models"; they now say 5. The docs no longer describe the Google AI engine as "AI Overview / SGE" (it scrapes AI Mode).
- `npm run test:scraper` dropped Grok and now falls back to the public dataset IDs, so it runs with just `BRIGHT_DATA_KEY` like the app does.

### 🧹 Maintenance

- `npm run lint` is back to 0 warnings: removed unused imports and made `demoMode` an explicit dependency of the workspace-loading and scheduler effects (no behaviour change; it never changes after mount).

---

## [1.5.0] — 2026-08-12

### ⚙️ Every environment variable is now optional

- **Zero-config deploy.** The Vercel deploy button no longer asks for a single key. A fresh deploy builds, boots, and lands on a working dashboard running the sample dataset; add `BRIGHT_DATA_KEY` afterwards to switch it to live data. Verified by building and booting with an empty environment.
- **Dataset IDs ship with the app.** `BRIGHT_DATA_DATASET_*` used to be required for the main tracking path — without them every engine failed with "not configured", even though the SRO path already had defaults. All five engines now carry Bright Data's public dataset ID, with the env vars kept as an override for custom or private datasets.
- **Zone names default sensibly.** `BRIGHT_DATA_SERP_ZONE` fell back to `serp_n8n`, a zone name that only existed on one account. It now falls back to `serp_api1`, the name Bright Data's own docs use.
- **Missing key is a state, not an error.** With no `BRIGHT_DATA_KEY` the dashboard renders the sample dataset behind a banner explaining what to add, instead of a live dashboard whose every request fails.

### 🐛 Fix: Gemini and Copilot no longer time out

- The scrape client aborted at exactly 60s, which is also when Bright Data's synchronous endpoint gives up and hands back a `snapshot_id` to poll. The two slowest engines lost that handoff and failed while faster ones passed. The client now waits 90s and follows the handoff whether it arrives as a `202` or as a `200` whose body is a bare `{snapshot_id}`.

### 🗑️ Removed: Grok

- Grok is gone from the engine list, types, API schema, colours, and demo data. Bright Data's Grok scraper accepts a trigger and then never completes — measured live at over 6 minutes still running while every other engine finished in 15-90 seconds. Leaving it in meant a guaranteed stall on every full run.

### ✅ Verified live

All five remaining engines were run end to end through `/api/scrape` with **no dataset env vars set**, confirming the defaults work: ChatGPT (2,194 chars / 47 sources), Perplexity (445 / 10), Gemini (2,656 / 0 — Gemini returns answers without citations), Copilot (2,604 / 5), Google AI Mode (3,358 / 28). Geo targeting re-confirmed: the same prompt at `US` vs `GB` returns 911 vs 999/112.

---

## [1.4.1] — 2026-07-22

### 🐛 Fix: geo-scoped tracking now actually targets the country

- The Region selector was sending the country as a `geolocation` input field, which Bright Data's AI scrapers silently ignore, so every country returned the same (default) answer. Now it sends the documented `country` field with the uppercase ISO code, which the scrapers honor. Verified live: the same prompt run at `US` vs `GB` returns market-specific answers (US → 911, Verizon/AT&T/T-Mobile; GB → 999/112, EE/Vodafone/Three/O2).
- Note: available countries vary by engine (Gemini excludes European countries, Grok is currently unavailable as a Bright Data scraper). An unsupported country is skipped for that engine while the others still run.

---

## [1.4.0] — 2026-07-22

### 🌍 New: Geo-scoped visibility tracking

- **Track AI visibility by country.** A new **Region** selector in the header runs your prompts through Bright Data from a chosen country (2-letter geolocation), so you can see how ChatGPT, Perplexity, Gemini, Copilot, Google AI, and Grok answer differently by market.
- **"Visibility by country"** panel in Visibility Analytics — average visibility per country, highest first.
- Each run is tagged with the country it was executed in, and the country is included in the runs CSV export.
- 13 countries out of the box (US, GB, CA, AU, DE, FR, ES, IT, NL, BR, IN, JP, MX).

> Note: geo scoping currently applies to the core multi-engine tracking path (`/api/scrape`). The SRO deep-analysis pipeline still runs US-based; per-country SRO is a planned follow-up.

---

## [1.3.2] — 2026-07-22

### 📝 Docs / Licensing

- **Added an MIT `LICENSE`.** The repo was previously unlicensed (all rights reserved by default), which blocked forking and self-hosting despite the open-source intent. (#9)
- **Added a committed `.env.example`** with every variable documented inline, so setup is copy-paste (`cp .env.example .env`). (#8)
- **README setup rewrite:** what each variable does, `BRIGHT_DATA_DATASET_GROK` marked optional (Bright Data does not always list a public Grok scraper), why `GEMINI_API_KEY` is needed alongside OpenRouter (it powers the Google Search grounding stage OpenRouter can't do), and how to set the SERP + Web Unlocker zones. (#8)
- `.gitignore` now allows `.env.example` while keeping real `.env` files ignored.

### 🐛 Fixes

- Clearer, actionable error when an engine's dataset ID is unset: it names the engine as optional and tells you to set the env var or deselect it, instead of a generic missing-id throw.

---

## [1.3.1] — 2026-06-20

### 🤖 Default model → Gemini 3.5 Flash

- Switched the default LLM to **`gemini-3.5-flash`** everywhere (verified live on both OpenRouter and the Google Gemini API): the OpenRouter routes (`/api/analyze`, `/api/sro-analyze`, `/api/site-context`, Competitor Battlecards) now default to `google/gemini-3.5-flash`, and the SRO **Gemini Grounding** stage (`lib/server/gemini-grounding.ts`) uses `gemini-3.5-flash`. Faster and stronger at structured output than the previous mix (`kimi-k2.5` / `gemini-2.5-flash`). Still overridable via `OPENROUTER_MODEL`.

---

## [1.3.0] — 2026-06-20

A security, reliability, and UX hardening release, plus fixes for two features
that were broken in production (caught by an end-to-end live QA pass).

### 🔒 Security

- **Authenticated the cloud sync API.** `/api/state` now requires a shared secret (`STATE_SYNC_SECRET`, entered once in **Project Settings → Cloud Sync** as a passphrase). Before this, a public deployment with Supabase enabled exposed the entire KV store to anonymous read / write / delete. ⚠️ **Breaking for cloud-sync users only:** set `STATE_SYNC_SECRET` and the passphrase, or sync requests are rejected (local-first mode is unaffected).
- **SSRF protection** on `/api/audit` (`lib/server/ssrf.ts`) — rejects internal/reserved targets (cloud metadata, localhost, private ranges) and re-validates every redirect hop.
- **Rate limiting** on all `/api/*` routes (`proxy.ts`) to curb API-cost abuse.
- **Fixed a data-loss race** where the initial empty state could overwrite stored data during load.
- **Dependencies:** Next.js 16.1.6 → 16.2.9; cleared the protobufjs RCE and related advisories.

### ⚡ Reliability

- Hard timeouts on every external call (`lib/server/http.ts`).
- `/api/bulk-sro` stops the SSE pipeline on client disconnect (no more burning API credits after a tab close).
- Debounced state saves, bounded in-memory caches, NDJSON parse hardening, tightened input validation, and upstream error bodies are no longer leaked to clients.

### 🎨 Design

- **Overview-first dashboard** — lands on a Visibility Analytics overview instead of the prompt table.
- New **"Visibility by AI engine"** per-model bars.
- KPI strip + Top Movers scoped to the overview (no longer repeated on every tab); slimmer demo banner; unified color tokens (fixes SRO colors that broke in light mode).

### 🐛 Fixes (found in live QA)

- **SRO Analysis + Site Context were broken in production:** the OpenRouter model `google/gemini-2.0-flash-001` was retired (404 "No endpoints found"). Switched to `google/gemini-2.5-flash` (overridable via `OPENROUTER_MODEL`).
- **Competitor Battlecards timed out:** the single combined request exceeded the edge/serverless limits. Split into per-competitor parallel requests on the Node runtime, with a reliable structured-output model via a new optional `model` param on `/api/analyze`.

### 🧪 Demo

- Refreshed sample data so the demo exercises every feature: populated Citation Opportunities, a full sentiment mix, an 8-point rising visibility trend, and a seeded SRO Analysis result.
- Reframed the demo to a neutral example brand (a fictional meal-kit service) and cleared the default competitor list.

### 📝 Docs / Config

- Documented new env vars: `BRIGHT_DATA_SERP_ZONE`, `BRIGHT_DATA_UNLOCKER_ZONE`, `STATE_SYNC_SECRET`, and the optional `OPENROUTER_MODEL`.
- Fixed stale repo URLs and the live-demo link.

---

## [1.2.0] — 2026-04-17

### ✨ New: Optional Supabase cloud persistence

Local-first storage (IndexedDB) remains the default. When you supply three env vars, all app state is automatically synced to your own free Supabase project — across devices, deploys, and browser clears.

**What changed**

- **`app/api/state/route.ts`** — new `GET / PUT / DELETE` route that proxies reads and writes to Supabase using the `service_role` key server-side. The client never calls Supabase directly. Returns `501` gracefully when cloud is not configured.
- **`lib/server/supabase.ts`** — `getServerSupabase()` singleton; reads `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- **`lib/server/kv-store.ts`** — `kvGet` / `kvSet` / `kvDelete` helpers used by the route.
- **`lib/client/cloud-mode.ts`** — `isCloudAvailable()` (build-time env flag) and `isCloudEnabledByUser()` (per-browser localStorage toggle, defaults to `true` when cloud is available).
- **`lib/client/sovereign-store.ts`** — rewired to branch on `isCloudActive()`. IDB becomes a local cache when cloud is active; IDB is the authoritative fallback if the cloud route fails. Public API (`loadSovereignValue` / `saveSovereignValue` / `clearSovereignStore`) is unchanged — all existing callers work without modification.
- **`components/dashboard/tabs/project-settings-tab.tsx`** — new **Cloud Sync** card in Project Settings. Shows setup instructions when cloud is not configured; shows an enable/disable toggle when it is.
- **`supabase/migrations/001_kv_store.sql`** — single-table `kv_store` schema (`key TEXT PK, value JSONB, created_at, updated_at`) with an `updated_at` trigger. Paste and run in your Supabase SQL editor to set up.
- **`package.json`** — added `@supabase/supabase-js ^2.103.3`.
- **`README.md`** — new "☁️ Optional: Cloud persistence with Supabase" section with 5-step setup guide; architecture tree updated; API routes table updated; Cloud Sync added to nav.

**Env vars needed (all optional)**

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key   # server-side only, never exposed to client
NEXT_PUBLIC_CLOUD_STORAGE_ENABLED=true
```

**What is NOT synced (intentionally local)**

- Theme preference
- Workspace list / active workspace
- The `sovereign-cloud-sync` toggle state itself

---

## [1.1.0] — 2026-03-22

### ✨ Features

- **Prompt tags** — inline tag editing on prompts; filter bar to narrow prompt list by tag
- **Delete individual responses** — confirmation dialog guards accidental deletes
- **Multiple website URLs** — chip-based input supporting multiple URLs per brand
- **Structured competitors** — `Competitor` type with name, aliases, and websites fields

### 🐛 Fixes

- Increase Bright Data scraper timeout with exponential backoff to reduce timeout failures (#3)
- Backward-compatible data migrations for all new data types

---

## [1.0.0] — 2026-03-13

### ✨ Features

- **SRO Analysis** — full 6-stage pipeline: Gemini Grounding → Cross-Platform Citations → SERP → Page Scraping → Site Context → LLM Analysis. Produces SRO Score (0–100) with prioritized recommendations.
- **Parallel batch runs** — all prompt × model combos execute simultaneously via `Promise.allSettled()`
- **Mobile-responsive** — collapsible sidebar (hamburger at `md:` breakpoint), backdrop overlay, responsive KPI grid and model toolbar

### 🆕 New API routes

`/api/sro-analyze`, `/api/bulk-sro` (SSE), `/api/serp`, `/api/site-context`, `/api/unlocker`, `/api/brightdata-platforms`

### 🐛 Fix

- Grok badge invisible in light mode (#1)

---

## [0.1.0] — 2026-02-14

Initial release — 12-tab dashboard, 6 AI model tracking, local-first storage, demo mode, Bright Data + OpenRouter integration.
