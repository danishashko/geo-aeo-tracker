# geo-aeo-tracker

AI visibility tracker and AEO checker for your terminal. Check how ChatGPT, Perplexity, Gemini and Google AI Mode mention your brand, run a GEO/AEO audit on any page, and get your Google rank.

This is the CLI of [GEO/AEO Tracker](https://github.com/danishashko/geo-aeo-tracker), the open-source, self-hosted AI visibility dashboard. It runs on your own [Bright Data](https://brightdata.com/?utm_source=geo-tracker-os) key; the audit needs no key.

```bash
export BRIGHT_DATA_KEY=your_key
```

## Track your brand in AI answers

```bash
npx geo-aeo-tracker check "What is the best CRM for a small business?" --brand HubSpot --competitor Salesforce,Pipedrive,Zoho --website hubspot.com
```

A real run (11 Nov 2026, Perplexity left out during a Bright Data outage):

```
ChatGPT         100  mentioned, positive, site cited, 5 sources, competitors: Pipedrive, Zoho
Gemini          60   mentioned, positive, 14 sources, competitors: Pipedrive, Zoho
Google AI Mode  93   mentioned, positive, site cited, 7 sources, competitors: Pipedrive, Zoho

Average visibility: 84  (3 of 3 engines answered)
```

Each engine gets a visibility score from 0 to 100 (mentions, position and whether your site is cited), plus sentiment and the competitors it named. Engines run in parallel; a run takes 1 to 5 minutes and bills Bright Data once per engine.

| Option | |
|---|---|
| `--brand <name>` | Brand to look for (required) |
| `--alias <name>` | Another name for the brand, repeatable |
| `--competitor <name>` | Competitor to count, repeatable or comma-separated |
| `--website <domain>` | Your domain; a cited source on it adds to the score |
| `--engine <id>` | `chatgpt`, `perplexity`, `gemini` or `google_ai`, repeatable. Default all |
| `--country <cc>` | 2-letter country to ask from. Default US |
| `--timeout <seconds>` | Per-engine deadline. Default 300 |
| `--full` | Print each full answer |
| `--min-score <n>` | Exit 3 if the average visibility is below `n` |

## GEO/AEO audit (free)

```bash
npx geo-aeo-tracker audit https://acme.com
```

20 checks for AI search readiness, scored 0 to 100: llms.txt, AI crawler access in robots.txt, sitemap, JSON-LD and FAQ schema, Open Graph, answer-first (BLUF) content, headings, content depth, server-side rendering and more. Failed checks print how to fix them.

## Google rank

```bash
npx geo-aeo-tracker serp "best crm for startups" --target acme.com --limit 10
```

## In CI

Every command takes `--json`. `check` and `audit` take `--min-score` and exit with code 3 below it, so a scheduled GitHub Actions job can fail when visibility drops.

| Exit code | Meaning |
|---|---|
| 0 | OK |
| 1 | Failed (no engine answered, page not reachable, no results) |
| 2 | Bad usage or missing `BRIGHT_DATA_KEY` |
| 3 | Below `--min-score` |

## Setup

- Node.js 20.12 or newer.
- `BRIGHT_DATA_KEY` for `check` and `serp`. `BRIGHT_DATA_SERP_ZONE` names your SERP API zone (default `serp_api1`).
- `.env.local` and `.env` in the current folder are read if present. Variables already set in your shell win.

`npx geo-aeo-tracker engines` lists the engines, their Bright Data dataset IDs and known outages.

MIT licensed.
