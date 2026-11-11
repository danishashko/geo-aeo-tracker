// Bundles cli/src into one dependency-free file at cli/dist/cli.js.
import { build } from "esbuild";
import { copyFileSync, readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("cli/package.json", "utf8"));

await build({
  entryPoints: ["cli/src/index.ts"],
  outfile: "cli/dist/cli.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: { js: "#!/usr/bin/env node" },
  define: { __CLI_VERSION__: JSON.stringify(pkg.version) },
  legalComments: "none",
});

copyFileSync("LICENSE", "cli/LICENSE");
console.log(`Built cli/dist/cli.js (geo-aeo-tracker ${pkg.version})`);
