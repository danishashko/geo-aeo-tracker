// One description of every command. Help text, `help --json`, flag parsing and
// the per-command flag check are all built from this, so they cannot drift.
import { AI_SCRAPER_PROVIDERS } from "../../lib/server/brightdata-scraper";

export interface OptionSpec {
  name: string;
  type: "string" | "boolean";
  multiple?: boolean;
  /** Placeholder shown in help, e.g. "<name>". */
  value?: string;
  description: string;
  default?: string | number;
  enum?: readonly string[];
}

export interface CommandSpec {
  name: string;
  summary: string;
  /** When an agent or user should pick this command. */
  useWhen: string;
  usage: string;
  args: { name: string; description: string; required: boolean }[];
  options: OptionSpec[];
  needsKey: boolean;
  cost: string;
  duration: string;
  /** Top-level fields of the --json output and what they mean. */
  jsonOutput: Record<string, string>;
  examples: string[];
}

const ENGINE_IDS = AI_SCRAPER_PROVIDERS;

const JSON_OPT: OptionSpec = {
  name: "json",
  type: "boolean",
  description: "Print one JSON document on stdout instead of text (errors too)",
};

const MIN_SCORE = (what: string): OptionSpec => ({
  name: "min-score",
  type: "string",
  value: "<0-100>",
  description: `Exit 3 if ${what} is below this. For CI and agent checks`,
});

export const COMMANDS: CommandSpec[] = [
  {
    name: "check",
    summary:
      "Ask AI engines one prompt and score how visible your brand is in each answer",
    useWhen:
      "You want to know whether ChatGPT, Perplexity, Gemini or Google AI Mode mention, recommend or cite a brand for a question buyers ask. Run one prompt first; each run bills Bright Data once per engine.",
    usage: 'geo-aeo-tracker check "<prompt>" --brand <name> [options]',
    args: [
      {
        name: "prompt",
        description:
          "The question a buyer would ask the AI engine, 3 to 2000 characters. Quote it",
        required: true,
      },
    ],
    options: [
      {
        name: "brand",
        type: "string",
        value: "<name>",
        description: "Brand to look for (required)",
      },
      {
        name: "alias",
        type: "string",
        multiple: true,
        value: "<name>",
        description:
          "Another name for the brand, e.g. a product name. Repeatable or comma-separated",
      },
      {
        name: "competitor",
        type: "string",
        multiple: true,
        value: "<name>",
        description:
          "Competitor to count in each answer. Repeatable or comma-separated",
      },
      {
        name: "website",
        type: "string",
        multiple: true,
        value: "<domain>",
        description:
          "Brand domain; a cited source on it raises the score. Repeatable",
      },
      {
        name: "engine",
        type: "string",
        multiple: true,
        value: "<id>",
        enum: ENGINE_IDS,
        description: "Engine to ask. Repeatable. Default: all",
      },
      {
        name: "country",
        type: "string",
        value: "<cc>",
        default: "US",
        description: "2-letter country the prompt is asked from",
      },
      {
        name: "timeout",
        type: "string",
        value: "<seconds>",
        default: 300,
        description:
          "Per-engine deadline, 10 to 1800. A slow engine becomes an error; the rest still return",
      },
      {
        name: "full",
        type: "boolean",
        description: "Print each full answer (always included with --json)",
      },
      MIN_SCORE("the average visibility"),
      JSON_OPT,
    ],
    needsKey: true,
    cost: "Bright Data AI Scraper, once per engine",
    duration: "30 seconds to 5 minutes; engines run in parallel",
    jsonOutput: {
      "summary.averageVisibility":
        "Mean 0-100 visibility over engines that answered, or null",
      "summary.enginesAnswered": "How many engines returned an answer",
      "summary.enginesMentioningBrand":
        "Engine ids whose answer names the brand",
      "results[].engine": "Engine id",
      "results[].status": "ok, error (with error and maybe note) or empty",
      "results[].visibilityScore":
        "0-100 from mentions, position, frequency, citations and sentiment",
      "results[].sentiment": "positive, neutral or negative toward the brand",
      "results[].brandMentions / competitorMentions":
        "Names found in the answer",
      "results[].websiteCited / citedBrandUrls":
        "Whether, and which, sources are on --website",
      "results[].sources": "Up to 25 cited URLs",
      "results[].answer": "The full answer text",
    },
    examples: [
      'geo-aeo-tracker check "What is the best CRM for a small business?" --brand HubSpot --competitor Salesforce,Pipedrive --website hubspot.com --json',
      'geo-aeo-tracker check "best meal kit for families" --brand Forkful --engine chatgpt --engine gemini --country GB',
    ],
  },
  {
    name: "audit",
    summary:
      "Check one page for AI search readiness (GEO/AEO audit), scored 0-100",
    useWhen:
      "You want to know why AI engines may not read, trust or cite a page: llms.txt, AI crawler access in robots.txt, sitemap, structured data, answer-first content, headings, rendering. Free and needs no key, so run it first.",
    usage: "geo-aeo-tracker audit <url> [--json] [--min-score <n>]",
    args: [
      {
        name: "url",
        description: "Public http(s) page. https:// is added if missing",
        required: true,
      },
    ],
    options: [MIN_SCORE("the audit score"), JSON_OPT],
    needsKey: false,
    cost: "Free",
    duration: "2 to 20 seconds",
    jsonOutput: {
      score: "0-100, the share of the 20 checks that pass",
      "checks[].id / label / category":
        "Which check (discovery, structure, content, technical, rendering)",
      "checks[].pass": "true or false",
      "checks[].value": "What was found",
      "checks[].detail": "What it means and how to fix it",
    },
    examples: ["geo-aeo-tracker audit https://hubspot.com --json"],
  },
  {
    name: "serp",
    summary:
      "Google organic results for a keyword, and the rank of your domain",
    useWhen:
      "You want classic Google rankings next to AI visibility, or the pages AI engines are likely to draw from for a keyword.",
    usage:
      'geo-aeo-tracker serp "<keyword>" [--target <domain>] [--limit <n>] [--json]',
    args: [
      {
        name: "keyword",
        description: "Search query. Quote it",
        required: true,
      },
    ],
    options: [
      {
        name: "target",
        type: "string",
        value: "<domain>",
        description: "Your domain or URL; its rank comes back as targetRank",
      },
      {
        name: "limit",
        type: "string",
        value: "<1-100>",
        default: 10,
        description: "How many organic results to print",
      },
      JSON_OPT,
    ],
    needsKey: true,
    cost: "Bright Data SERP API, once (twice if Google's first answer fails)",
    duration: "3 to 25 seconds",
    jsonOutput: {
      targetRank: "Position of --target, or null if not in the results",
      totalResults: "Organic results Google returned",
      "organicResults[].position / title / url / domain":
        "One result. url can be a Google redirect; domain is the real site",
    },
    examples: [
      'geo-aeo-tracker serp "best crm for small business" --target hubspot.com --json',
    ],
  },
  {
    name: "skill",
    summary:
      "Print or install the Agent Skill that teaches AI agents to use this CLI",
    useWhen:
      "Setting up Claude Code or another agent that reads SKILL.md files, so it knows when and how to run geo-aeo-tracker without being told.",
    usage: "geo-aeo-tracker skill [--install] [--dir <folder>]",
    args: [],
    options: [
      {
        name: "install",
        type: "boolean",
        description:
          "Write SKILL.md to ~/.claude/skills/geo-aeo-tracker/ (or --dir)",
      },
      {
        name: "dir",
        type: "string",
        value: "<folder>",
        description: "Folder to write SKILL.md into instead, for other agents",
      },
      JSON_OPT,
    ],
    needsKey: false,
    cost: "Free, no network call",
    duration: "Instant",
    jsonOutput: {
      installed: "Path written (with --install)",
      skill: "SKILL.md text (without --install)",
    },
    examples: ["geo-aeo-tracker skill --install"],
  },
  {
    name: "engines",
    summary:
      "List the AI engines, their Bright Data dataset IDs and known outages",
    useWhen:
      "Before check, to see which engines exist and whether one is down.",
    usage: "geo-aeo-tracker engines [--json]",
    args: [],
    options: [JSON_OPT],
    needsKey: false,
    cost: "Free, no network call",
    duration: "Instant",
    jsonOutput: {
      "engines[].id / label / datasetId": "Engine to pass to check --engine",
      "engines[].note": "Known outage, if any",
      retired: "Engines that were removed, with the reason",
    },
    examples: ["geo-aeo-tracker engines --json"],
  },
];

export const EXIT_CODES = {
  "0": "OK",
  "1": "Failed: no engine answered, page unreachable or blocked, no search results",
  "2": "Bad usage or missing BRIGHT_DATA_KEY. Nothing was billed",
  "3": "Ran fine, but the score is below --min-score",
};

export const ENVIRONMENT = {
  BRIGHT_DATA_KEY:
    "Required for check and serp. https://brightdata.com/?utm_source=geo-tracker-os",
  BRIGHT_DATA_SERP_ZONE: "SERP API zone name (default serp_api1)",
  ".env files":
    ".env.local and .env in the current folder are read; shell variables win",
};

/** Machine-readable description of the CLI, printed by `help --json`. */
export function describe(version: string) {
  return {
    name: "geo-aeo-tracker",
    version,
    description:
      "AI visibility tracker and AEO checker: score how ChatGPT, Perplexity, Gemini and Google AI Mode mention a brand, audit pages for AI search, get Google rank.",
    recommendedFlow: [
      "engines --json (free): see which engines are up",
      "audit <url> --json (free): fix what stops AI engines reading the site",
      'check "<buyer question>" --brand <name> --json: one prompt first, then more',
      "serp <keyword> --target <domain> --json: compare with classic Google rank",
    ],
    conventions: {
      stdout:
        'With --json, exactly one JSON document, also on errors: {"error":{"type","message","exitCode"}}',
      stderr: "Progress lines and human error text",
      interactive: "Never prompts; safe to run unattended",
    },
    commands: COMMANDS.map((c) => ({
      name: c.name,
      summary: c.summary,
      useWhen: c.useWhen,
      usage: c.usage,
      args: c.args,
      options: c.options.map((o) => ({
        flag: `--${o.name}`,
        type: o.type,
        ...(o.multiple ? { repeatable: true } : {}),
        ...(o.enum ? { enum: o.enum } : {}),
        ...(o.default !== undefined ? { default: o.default } : {}),
        description: o.description,
      })),
      needsBrightDataKey: c.needsKey,
      cost: c.cost,
      duration: c.duration,
      jsonOutput: c.jsonOutput,
      examples: c.examples,
    })),
    exitCodes: EXIT_CODES,
    environment: ENVIRONMENT,
    docs: "https://github.com/danishashko/geo-aeo-tracker#cli",
  };
}

function pad(text: string, width: number) {
  return text + " ".repeat(Math.max(1, width - text.length));
}

function optionLines(c: CommandSpec): string[] {
  return c.options.map((o) => {
    const flag = `--${o.name}${o.value ? ` ${o.value}` : ""}`;
    const extra = [
      o.enum ? `one of ${o.enum.join(", ")}` : "",
      o.default !== undefined ? `default ${o.default}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    return `  ${pad(flag, 24)}${o.description}${extra ? ` (${extra})` : ""}`;
  });
}

/** Help for one command. */
export function commandHelp(name: string): string | null {
  const c = COMMANDS.find((x) => x.name === name);
  if (!c) return null;
  return [
    `geo-aeo-tracker ${c.name}: ${c.summary}`,
    "",
    `Usage: ${c.usage}`,
    "",
    `Use when: ${c.useWhen}`,
    `Cost: ${c.cost}. Takes: ${c.duration}.${c.needsKey ? " Needs BRIGHT_DATA_KEY." : ""}`,
    "",
    ...(c.args.length
      ? [
          "Arguments",
          ...c.args.map((a) => `  ${pad(`<${a.name}>`, 24)}${a.description}`),
          "",
        ]
      : []),
    "Options",
    ...optionLines(c),
    "",
    "Example",
    `  ${c.examples[0]}`,
  ].join("\n");
}

/** The overview printed by `--help`. */
export function overviewHelp(): string {
  return [
    "geo-aeo-tracker: AI visibility tracker and AEO checker for your terminal and your AI agents",
    "",
    "Commands",
    ...COMMANDS.map((c) => `  ${pad(c.name, 9)}${c.summary}. ${c.cost}.`),
    "",
    "Usage",
    ...COMMANDS.map((c) => `  ${c.usage}`),
    "",
    "Start here: engines (free), then audit <your site> (free), then one check.",
    "",
    "More",
    "  geo-aeo-tracker help <command>   Options, cost and an example for one command",
    "  geo-aeo-tracker help --json      Everything above as JSON, for AI agents",
    "  --json                           JSON on stdout, also for errors",
    "  -v, --version",
    "",
    "Environment",
    ...Object.entries(ENVIRONMENT).map(([k, v]) => `  ${pad(k, 24)}${v}`),
    "",
    "Exit codes: 0 ok, 1 failed, 2 bad usage or no key (nothing billed), 3 below --min-score.",
  ].join("\n");
}
