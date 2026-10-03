#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * run-company.mjs — programmatic AEO run for one company.
 *
 * Given a company + competitors + prompts, this:
 *   1. fires each (prompt × provider) at the running dev server's /api/scrape
 *   2. scores each answer with the SAME logic the dashboard uses
 *      (mirror of components/sovereign-dashboard.tsx — see GUIDE for the
 *       "extract to lib/scoring.ts" cleanup that removes this duplication)
 *   3. prints a summary table
 *   4. writes public/aeo-inject.json  → used by the browser-console snippet
 *      to make results show up in the UI (see docs/programmatic-aeo-runs.md)
 *   5. if Supabase cloud is configured, optionally pushes straight into the
 *      workspace via /api/state (pass --push)
 *
 * Prereqs: dev server running (`npm run dev`) and .env populated with the
 * BRIGHT_DATA_* / GEMINI_API_KEY / OPENROUTER_KEY keys.
 *
 * Usage:
 *   node scripts/run-company.mjs scripts/example-company.json
 *   node scripts/run-company.mjs scripts/example-company.json --push
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// ── args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const push = args.includes("--push");
const configPath = args.find((a) => !a.startsWith("--")) ?? "scripts/example-company.json";
const config = JSON.parse(readFileSync(resolve(repoRoot, configPath), "utf8"));

const BASE = config.baseUrl ?? "http://localhost:3000";
const PROVIDERS = config.providers ?? ["chatgpt", "google_ai"];
// ISO-2 country (e.g. "ES") geo-targets the scrape; without it Bright Data answers
// from a random exit country, so local results come back localised elsewhere.
const COUNTRY = config.country ? String(config.country).toUpperCase() : undefined;
const STORAGE_KEY = "sovereign-aeo-tracker-v1"; // default workspace

const brandName = config.brand.name;
const brandAliases = config.brand.aliases ?? [];
const brandWebsites = config.brand.websites ?? [];
const brandTerms = [brandName, ...brandAliases].filter(Boolean);
const competitors = config.competitors ?? [];
const competitorTerms = competitors.flatMap((c) => [c.name, ...(c.aliases ?? [])]).filter(Boolean);

// ── scoring (mirror of sovereign-dashboard.tsx lines ~677-758) ──────────────
const POS = ["best","leading","top","excellent","recommend","great","outstanding","innovative","trusted","powerful","superior","preferred","popular","reliable","impressive","standout","strong","ideal"];
const NEG = ["worst","poor","bad","avoid","lacking","weak","inferior","disappointing","overpriced","limited","outdated","risky","problematic","concern","drawback","downside"];

function findMentions(text, terms) {
  const lower = text.toLowerCase();
  return terms.filter((t) => lower.includes(t.toLowerCase()));
}
function detectSentiment(answer, terms) {
  if (terms.length === 0) return "not-mentioned";
  const lower = answer.toLowerCase();
  if (!terms.some((t) => lower.includes(t.toLowerCase()))) return "not-mentioned";
  let p = 0, n = 0;
  POS.forEach((w) => { if (lower.includes(w)) p++; });
  NEG.forEach((w) => { if (lower.includes(w)) n++; });
  if (p > n + 1) return "positive";
  if (n > p + 1) return "negative";
  return "neutral";
}
function calcVisibilityScore(answer, sources, terms, websites) {
  if (terms.length === 0) return 0;
  const lower = answer.toLowerCase();
  if (!terms.some((t) => lower.includes(t.toLowerCase()))) return 0;
  let score = 30;
  if (terms.some((t) => lower.slice(0, 200).includes(t.toLowerCase()))) score += 20;
  const count = terms.reduce((acc, t) =>
    acc + (lower.match(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"))?.length ?? 0), 0);
  if (count >= 3) score += 15; else if (count >= 2) score += 8;
  const domains = (websites ?? []).map((w) => w.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase()).filter(Boolean);
  if (domains.length && sources.some((s) => { const sl = s.toLowerCase(); return domains.some((d) => sl.includes(d)); })) score += 20;
  const sent = detectSentiment(answer, terms);
  if (sent === "positive") score += 15; else if (sent === "neutral") score += 5;
  return Math.min(100, score);
}

// ── run ─────────────────────────────────────────────────────────────────────
const jobs = [];
for (const prompt of config.prompts)
  for (const provider of PROVIDERS)
    jobs.push({ prompt, provider });

console.log(`Firing ${jobs.length} scrapes (${config.prompts.length} prompts × ${PROVIDERS.length} providers) at ${BASE} …\n`);
const t0 = Date.now();

const runs = await Promise.all(jobs.map(async ({ prompt, provider }) => {
  try {
    const res = await fetch(`${BASE}/api/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, prompt, ...(COUNTRY ? { country: COUNTRY } : {}) }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
    const answer = data.answer ?? "";
    const sources = data.sources ?? [];
    return {
      provider, prompt, answer, sources,
      createdAt: new Date().toISOString(),
      visibilityScore: calcVisibilityScore(answer, sources, brandTerms, brandWebsites),
      sentiment: detectSentiment(answer, brandTerms),
      brandMentions: findMentions(answer, brandTerms),
      competitorMentions: findMentions(answer, competitorTerms),
    };
  } catch (e) {
    console.warn(`  ! ${provider} / "${prompt.slice(0, 40)}…" failed: ${e.message}`);
    return null;
  }
}));

const ok = runs.filter(Boolean);
console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(0)}s — ${ok.length}/${jobs.length} succeeded.\n`);

// ── summary table ────────────────────────────────────────────────────────────
const PROV = { chatgpt: "ChatGPT", perplexity: "Perplexity", copilot: "Copilot", gemini: "Gemini", google_ai: "Google AI", grok: "Grok" };
console.log("PROMPT".padEnd(44), "ENGINE".padEnd(11), "VISIBILITY", " SENTIMENT", "  COMPETITORS SEEN");
console.log("-".repeat(110));
for (const r of ok) {
  console.log(
    r.prompt.slice(0, 42).padEnd(44),
    (PROV[r.provider] ?? r.provider).padEnd(11),
    String(r.visibilityScore).padStart(6) + "    ",
    (r.brandMentions.length ? r.sentiment : "not-mentioned").padEnd(14),
    (r.competitorMentions.join(", ") || "—"),
  );
}
const avg = ok.length ? (ok.reduce((a, r) => a + r.visibilityScore, 0) / ok.length).toFixed(1) : "0";
const hits = ok.filter((r) => r.brandMentions.length > 0).length;
console.log("-".repeat(110));
console.log(`\n${brandName}: appeared in ${hits}/${ok.length} answers | avg visibility ${avg}/100\n`);

// ── write inject file for the browser-console UI path ────────────────────────
const patch = {
  brand: {
    brandName,
    brandAliases: brandAliases.join(", "),
    websites: brandWebsites,
    industry: config.industry ?? "",
    keywords: config.keywords ?? "",
    description: config.description ?? "",
  },
  competitors: competitors.map((c) => ({ name: c.name, aliases: c.aliases ?? [], websites: c.websites ?? [] })),
  customPrompts: config.prompts.map((text) => ({ text, tags: [] })),
  runs: ok,
};
mkdirSync(resolve(repoRoot, "public"), { recursive: true });
writeFileSync(resolve(repoRoot, "public/aeo-inject.json"), JSON.stringify(patch, null, 2));
console.log("Wrote public/aeo-inject.json — see docs/programmatic-aeo-runs.md → 'Show it in the UI'.");

// ── optional cloud push (only works if Supabase env is configured) ───────────
if (push) {
  const getRes = await fetch(`${BASE}/api/state?key=${STORAGE_KEY}`, { cache: "no-store" });
  if (getRes.status === 501) {
    console.log("\n--push skipped: cloud storage not configured (Supabase env vars absent). Use the console snippet instead.");
  } else {
    const existing = (await getRes.json()).value ?? {};
    const merged = {
      ...existing,
      brand: { ...(existing.brand ?? {}), ...patch.brand },
      competitors: patch.competitors,
      customPrompts: patch.customPrompts,
      runs: [...(existing.runs ?? []), ...patch.runs],
    };
    const putRes = await fetch(`${BASE}/api/state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: STORAGE_KEY, value: merged }),
    });
    console.log(putRes.ok ? "\nPushed to cloud workspace via /api/state — reload the app to see it." : `\nCloud push failed: HTTP ${putRes.status}`);
  }
}
