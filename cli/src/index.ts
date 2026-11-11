import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDatasetId } from "../../lib/server/brightdata-scraper";
import { runAudit } from "../../lib/server/audit";
import { defaultScrape, defaultSerp } from "../../lib/server/visibility";
import { run } from "./run";

// `geo-aeo-tracker audit x | head` closes the pipe early; stop quietly then.
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") process.exit(process.exitCode ?? 0);
    throw err;
  });
}

// Values already in the environment win over .env files.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

run(process.argv.slice(2), {
  scrape: defaultScrape,
  serp: defaultSerp,
  audit: runAudit,
  datasetId: getDatasetId,
  env: process.env,
  // dist/cli.js and src/run.ts both sit one level below the package root.
  skillText: () =>
    readFileSync(
      fileURLToPath(new URL("../skill/SKILL.md", import.meta.url)),
      "utf8",
    ),
  installSkill: (dir) => {
    const folder = resolve(
      dir ?? join(homedir(), ".claude", "skills", "geo-aeo-tracker"),
    );
    mkdirSync(folder, { recursive: true });
    const path = join(folder, "SKILL.md");
    writeFileSync(
      path,
      readFileSync(
        fileURLToPath(new URL("../skill/SKILL.md", import.meta.url)),
        "utf8",
      ),
    );
    return path;
  },
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
}).then((code) => {
  // A timed-out engine leaves Bright Data's poll running in the background,
  // which would hold the process open for minutes. Flush output, then exit.
  process.stdout.write("", () =>
    process.stderr.write("", () => process.exit(code)),
  );
});
