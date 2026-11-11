---
name: geo-aeo-tracker
description: Check how ChatGPT, Perplexity, Gemini and Google AI Mode see a brand, and audit a website for AI search (GEO/AEO). Use when the user asks about AI visibility, brand mentions or citations in AI answers, LLM SEO, generative or answer engine optimization, llms.txt, or why AI tools do not recommend or cite their site.
---

# GEO/AEO Tracker

Use the `geo-aeo-tracker` CLI through `npx -y geo-aeo-tracker`. It never prompts, and every command takes `--json`.

## First

Run `npx -y geo-aeo-tracker help --json` once. It lists every command, flag, cost, duration and output field.

## Workflow

1. **Engines (free):** `npx -y geo-aeo-tracker engines --json`. Note any engine with an outage `note` and leave it out.
2. **Audit the site (free, no key):** `npx -y geo-aeo-tracker audit <site> --json`. Report the score and the failed checks, using each check's `detail` as the fix.
3. **Check visibility (paid):** needs `BRIGHT_DATA_KEY` in the environment or in `.env`. If it is missing, say so and stop; never ask for the key in chat. Run one prompt first:
   `npx -y geo-aeo-tracker check "<question a buyer would ask>" --brand <brand> --competitor <a,b> --website <domain> --json`
   Ask the user before running more than 3 prompts, because each engine call is billed.
4. **Google rank (paid, optional):** `npx -y geo-aeo-tracker serp "<keyword>" --target <domain> --json`.

## Reading results

- `summary.averageVisibility` (0-100) is the headline. Per engine: `visibilityScore`, `sentiment`, `brandMentions`, `competitorMentions`, `websiteCited`, `sources`.
- An engine where `competitorMentions` is set but `brandMentions` is empty is a gap. Its `sources` show the pages it trusts.
- Exit code 2 means bad input or a missing key, and nothing was billed. Exit code 1 means it failed. With `--json` the error is on stdout as `{"error": {...}}`.

## Report back

Lead with the average visibility and which engines mention the brand. Then name the competitors that beat it, the sources those engines cite, and the top 3 audit fixes.
