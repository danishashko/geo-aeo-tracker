import { existsSync } from "node:fs";
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
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
}).then((code) => {
  // A timed-out engine leaves Bright Data's poll running in the background,
  // which would hold the process open for minutes. Flush output, then exit.
  process.stdout.write("", () =>
    process.stderr.write("", () => process.exit(code)),
  );
});
