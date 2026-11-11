import { parseArgs } from "node:util";
import {
  AI_SCRAPER_PROVIDERS,
  type AiScraperProvider,
} from "../../lib/server/brightdata-scraper";
import {
  ENGINE_LABELS,
  checkVisibility,
  listEngines,
  serpOrThrow,
  type ScrapeFn,
  type SerpFn,
  type VisibilityReport,
} from "../../lib/server/visibility";
import type { AuditReport } from "../../lib/server/audit";
import { COMMANDS, commandHelp, describe, overviewHelp } from "./spec";

export interface CliDeps {
  scrape: ScrapeFn;
  serp: SerpFn;
  audit: (url: string) => Promise<AuditReport>;
  datasetId: (provider: AiScraperProvider) => string;
  env: Record<string, string | undefined>;
  /** SKILL.md text shipped in the package. */
  skillText: () => string;
  /** Writes SKILL.md into the folder (default ~/.claude/skills/geo-aeo-tracker) and returns its path. */
  installSkill: (dir?: string) => string;
  out: (text: string) => void;
  err: (text: string) => void;
}

/** Exit codes: 0 ok, 1 failed, 2 bad usage, 3 below --min-score. */
export const EXIT = { ok: 0, failed: 1, usage: 2, belowMin: 3 } as const;

class UsageError extends Error {}

// Flags each command accepts, from the spec. --help and --version are handled first.
const COMMAND_OPTIONS: Record<string, string[]> = Object.fromEntries(
  COMMANDS.map((c) => [c.name, c.options.map((o) => o.name)]),
);

/** The flags in the spec, typed. `spec.test` keeps this in step with COMMANDS. */
export interface ParsedValues {
  brand?: string;
  alias?: string[];
  competitor?: string[];
  website?: string[];
  engine?: string[];
  country?: string;
  timeout?: string;
  full?: boolean;
  "min-score"?: string;
  target?: string;
  limit?: string;
  json?: boolean;
  install?: boolean;
  dir?: string;
  help?: boolean;
  version?: boolean;
}

type ParseOptions = Record<
  string,
  { type: "string" | "boolean"; multiple?: boolean; short?: string }
>;
const PARSE_OPTIONS: ParseOptions = {
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
};
for (const c of COMMANDS) {
  for (const o of c.options) {
    PARSE_OPTIONS[o.name] = {
      type: o.type,
      ...(o.multiple ? { multiple: true } : {}),
    };
  }
}

function toInt(
  name: string,
  value: string | undefined,
  min: number,
  max: number,
) {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new UsageError(
      `--${name} must be a whole number from ${min} to ${max}`,
    );
  }
  return n;
}

function list(value: string[] | undefined): string[] {
  return (value ?? [])
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
}

function requireKey(deps: CliDeps) {
  if (!deps.env.BRIGHT_DATA_KEY) {
    throw new UsageError(
      "BRIGHT_DATA_KEY is not set. Get one at https://brightdata.com/?utm_source=geo-tracker-os, then export it or put it in .env.",
    );
  }
}

function pad(text: string, width: number) {
  return text + " ".repeat(Math.max(1, width - text.length));
}

function printVisibility(
  report: VisibilityReport,
  full: boolean,
  deps: CliDeps,
) {
  const { summary, results } = report;
  deps.out(
    `"${summary.prompt}"  brand: ${summary.brand}  country: ${summary.country}\n`,
  );
  for (const r of results) {
    if (r.status !== "ok") {
      deps.out(`${pad(r.label, 16)}${r.status.toUpperCase()}  ${r.error}`);
      if (r.note) deps.out(`${pad("", 16)}${r.note}`);
      continue;
    }
    const mentioned =
      r.brandMentions.length > 0 ? "mentioned" : "not mentioned";
    const cited = r.websiteCited ? ", site cited" : "";
    const rivals = r.competitorMentions.length
      ? `, competitors: ${r.competitorMentions.join(", ")}`
      : "";
    deps.out(
      `${pad(r.label, 16)}${pad(String(r.visibilityScore), 4)} ${mentioned}, ${r.sentiment}${cited}, ${r.sourceCount} source${r.sourceCount === 1 ? "" : "s"}${rivals}`,
    );
    if (full) deps.out(`\n${r.answer}\n`);
  }
  const avg = summary.averageVisibility;
  deps.out(
    `\nAverage visibility: ${avg ?? "n/a"}  (${summary.enginesAnswered} of ${results.length} engines answered)`,
  );
}

export async function run(argv: string[], deps: CliDeps): Promise<number> {
  const json = argv.includes("--json");
  const fail = (
    type: "usage" | "failed",
    message: string,
    exitCode: number,
  ) => {
    if (json)
      deps.out(JSON.stringify({ error: { type, message, exitCode } }, null, 2));
    deps.err(
      type === "usage"
        ? `Error: ${message}\nRun geo-aeo-tracker help for usage.`
        : `Error: ${message}`,
    );
    return exitCode;
  };
  try {
    return await dispatch(argv, deps);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return e instanceof UsageError
      ? fail("usage", message, EXIT.usage)
      : fail("failed", message, EXIT.failed);
  }
}

async function dispatch(argv: string[], deps: CliDeps): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: PARSE_OPTIONS,
    });
  } catch (e) {
    throw new UsageError(e instanceof Error ? e.message : String(e));
  }
  const { positionals } = parsed;
  const o = parsed.values as ParsedValues;
  const [command, ...rest] = positionals;

  if (o.version) {
    deps.out(VERSION);
    return EXIT.ok;
  }
  if (o.help || !command || command === "help") {
    // `help --json` (or any --help with --json) describes the whole CLI.
    if (o.json) {
      deps.out(JSON.stringify(describe(VERSION), null, 2));
      return EXIT.ok;
    }
    const topic = command === "help" ? rest[0] : command;
    if (topic) {
      const text = commandHelp(topic);
      if (!text) throw new UsageError(`Unknown command "${topic}"`);
      deps.out(text);
      return EXIT.ok;
    }
    deps.out(overviewHelp());
    return command || o.help ? EXIT.ok : EXIT.usage;
  }
  // Reject flags the command does not use, so a typo never runs silently.
  const allowed = COMMAND_OPTIONS[command];
  if (allowed) {
    const stray = Object.keys(o).filter((k) => !allowed.includes(k));
    if (stray.length) {
      throw new UsageError(
        `${stray.map((k) => `--${k}`).join(", ")} does not apply to ${command}`,
      );
    }
  }
  const minScore = toInt("min-score", o["min-score"], 0, 100);

  switch (command) {
    case "engines": {
      if (rest.length) throw new UsageError("engines takes no arguments");
      const data = listEngines(deps.datasetId);
      if (o.json) {
        deps.out(JSON.stringify(data, null, 2));
        return EXIT.ok;
      }
      for (const e of data.engines) {
        deps.out(
          `${pad(e.id, 12)}${pad(e.label, 16)}${e.datasetId}${e.note ? `\n${pad("", 12)}${e.note}` : ""}`,
        );
      }
      deps.out("\nRetired:");
      for (const r of data.retired) deps.out(`${pad(r.id, 12)}${r.reason}`);
      deps.out(`\nOutages: ${data.outages}`);
      return EXIT.ok;
    }

    case "check": {
      const prompt = rest.join(" ").trim();
      if (prompt.length < 3 || prompt.length > 2000) {
        throw new UsageError(
          'check needs a prompt of 3 to 2000 characters, e.g. check "best crm for startups" --brand Acme',
        );
      }
      if (!o.brand?.trim()) throw new UsageError("check needs --brand <name>");
      const engines = list(o.engine);
      const bad = engines.filter(
        (e) => !(AI_SCRAPER_PROVIDERS as readonly string[]).includes(e),
      );
      if (bad.length) {
        throw new UsageError(
          `Unknown engine ${bad.join(", ")}. Use ${AI_SCRAPER_PROVIDERS.join(", ")}`,
        );
      }
      if (o.country !== undefined && !/^[A-Za-z]{2}$/.test(o.country)) {
        throw new UsageError(
          "--country must be a 2-letter code, e.g. US or GB",
        );
      }
      const timeoutS = toInt("timeout", o.timeout, 10, 1800) ?? 300;
      requireKey(deps);

      const report = await checkVisibility(
        {
          prompt,
          brand: o.brand.trim(),
          aliases: list(o.alias),
          competitors: list(o.competitor),
          websites: list(o.website),
          engines: engines.length
            ? (engines as AiScraperProvider[])
            : undefined,
          country: o.country?.toUpperCase(),
          includeAnswer: o.full || o.json,
        },
        {
          scrape: deps.scrape,
          timeoutMs: timeoutS * 1000,
          onEngineDone: (engine, done, total) =>
            deps.err(`${ENGINE_LABELS[engine]} finished (${done}/${total})`),
        },
      );
      if (o.json) deps.out(JSON.stringify(report, null, 2));
      else printVisibility(report, Boolean(o.full), deps);

      if (report.summary.enginesAnswered === 0) return EXIT.failed;
      if (
        minScore !== undefined &&
        (report.summary.averageVisibility ?? 0) < minScore
      ) {
        deps.err(
          `Average visibility ${report.summary.averageVisibility} is below --min-score ${minScore}`,
        );
        return EXIT.belowMin;
      }
      return EXIT.ok;
    }

    case "audit": {
      const url = rest[0];
      if (!url || rest.length > 1)
        throw new UsageError(
          "audit needs one URL, e.g. audit https://example.com",
        );
      const target = /^[a-z][a-z0-9+.-]*:\/\//i.test(url)
        ? url
        : `https://${url}`;
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(target);
      } catch {
        throw new UsageError(`"${url}" is not a valid URL`);
      }
      if (!/^https?:$/.test(parsedUrl.protocol)) {
        throw new UsageError(`audit needs an http or https URL, got "${url}"`);
      }
      const report = await deps.audit(target);
      if (o.json) {
        deps.out(JSON.stringify(report, null, 2));
      } else {
        deps.out(`${report.url}  score ${report.score}/100\n`);
        for (const c of report.checks) {
          deps.out(
            `${c.pass ? "PASS" : "FAIL"}  ${pad(c.label, 30)}${c.value}`,
          );
          if (!c.pass) deps.out(`      ${c.detail}`);
        }
      }
      if (minScore !== undefined && report.score < minScore) {
        deps.err(
          `Audit score ${report.score} is below --min-score ${minScore}`,
        );
        return EXIT.belowMin;
      }
      return EXIT.ok;
    }

    case "serp": {
      const keyword = rest.join(" ").trim();
      if (!keyword)
        throw new UsageError('serp needs a keyword, e.g. serp "best crm"');
      const limit = toInt("limit", o.limit, 1, 100) ?? 10;
      requireKey(deps);
      const result = await serpOrThrow(deps.serp, keyword, o.target ?? "");
      const organic = result.organicResults.slice(0, limit);
      if (o.json) {
        deps.out(
          JSON.stringify(
            {
              keyword: result.keyword,
              targetRank: o.target ? result.targetRank : undefined,
              totalResults: result.totalResults,
              organicResults: organic,
            },
            null,
            2,
          ),
        );
        return EXIT.ok;
      }
      for (const r of organic) {
        // Google redirect links are long and opaque; show the site instead.
        const shown = /^https?:\/\/(www\.)?google\.[a-z.]+\/(goto|url)\b/i.test(
          r.url,
        )
          ? r.domain || "(site hidden by Google)"
          : r.url;
        deps.out(`${pad(String(r.position), 4)}${r.title}\n    ${shown}`);
      }
      if (o.target) {
        deps.out(
          `\n${o.target}: ${result.targetRank ? `rank ${result.targetRank}` : "not in the results"}`,
        );
      }
      return EXIT.ok;
    }

    case "skill": {
      if (rest.length) throw new UsageError("skill takes no arguments");
      if (o.install || o.dir !== undefined) {
        const path = deps.installSkill(o.dir);
        deps.out(
          o.json
            ? JSON.stringify({ installed: path }, null, 2)
            : `Installed ${path}`,
        );
        return EXIT.ok;
      }
      const skill = deps.skillText();
      deps.out(o.json ? JSON.stringify({ skill }, null, 2) : skill);
      return EXIT.ok;
    }

    default:
      throw new UsageError(`Unknown command "${command}"`);
  }
}

// Replaced at build time by esbuild; falls back for tests.
declare const __CLI_VERSION__: string | undefined;
export const VERSION =
  typeof __CLI_VERSION__ === "string" ? __CLI_VERSION__ : "0.0.0-dev";
