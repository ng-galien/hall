import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { groupFindings, sweepRules } from "../engine/sweep.mjs";

/*
 * Width sweep of the Hall screens: runs the sweep journeys on the disposable instance, groups the findings and compares
 * them with the accepted list. Exits with status 1 for a finding that is not accepted or an accepted line that no
 * longer matches anything.
 * Options: --screens=a,b (only these screens), --report-only (reuse the last measurements).
 */

const here = import.meta.dirname;
const clientDirectory = resolve(here, "../../..");
const outputDirectory = resolve(clientDirectory, "test-results/screen-audit-sweep");
const acceptedFile = resolve(here, "sweep-accepted.json");
const argument = (name) => process.argv.find((entry) => entry.startsWith(`--${name}`))?.split("=")[1] ?? null;
const selected = argument("screens");
const reportOnly = process.argv.includes("--report-only");

const started = Date.now();
if (!reportOnly) {
  rmSync(outputDirectory, { recursive: true, force: true });
  const result = spawnSync(process.execPath, [resolve(clientDirectory, "e2e/run.mjs")], {
    cwd: resolve(clientDirectory, "../.."),
    env: {
      ...process.env,
      HALL_SCREEN_AUDIT: "true",
      HALL_SCREEN_AUDIT_MODE: "sweep",
      HALL_SCREEN_AUDIT_OUTPUT: outputDirectory,
      HALL_E2E_LANES: process.env.HALL_E2E_LANES ?? "3",
      ...(selected ? { HALL_SCREEN_AUDIT_SCREENS: selected } : {}),
    },
    stdio: "inherit",
  });
  if (result.status !== 0) console.error(`Le balayage s'est terminé avec le statut ${result.status}.`);
}

const sweepDirectory = join(outputDirectory, "sweep");
const records = existsSync(sweepDirectory)
  ? readdirSync(sweepDirectory)
      .filter((file) => file.endsWith(".json"))
      .map((file) => JSON.parse(readFileSync(join(sweepDirectory, file), "utf8")))
  : [];
const measures = records.reduce((total, record) => total + record.measures, 0);
const missing = records.flatMap((record) => record.missing);
const groups = groupFindings(records.flatMap((record) => record.findings));
const accepted = JSON.parse(readFileSync(acceptedFile, "utf8")).accepted;
const acceptedKeys = new Map(accepted.map((entry) => [entry.key, entry.reason]));
const measuredScreens = new Set(records.flatMap((record) => record.screens));
const open = groups.filter((group) => !acceptedKeys.has(group.key));
const stale = accepted.filter(
  (entry) => measuredScreens.has(entry.key.split(" | ")[0]) && !groups.some((group) => group.key === entry.key),
);

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, "findings.json"), `${JSON.stringify({ measures, missing, groups }, null, 2)}\n`);

console.log(`\nBalayage : ${measuredScreens.size} écrans, ${measures} mesures, ${Math.round((Date.now() - started) / 1000)} s.`);
for (const [rule, title] of Object.entries(sweepRules)) {
  const count = groups.filter((group) => group.rule === rule).length;
  console.log(`  ${rule} (${title}) : ${count}`);
}
for (const line of missing) console.log(`Écran non ouvert : ${line}`);
for (const group of open) {
  console.log(`\nÉcart : ${group.key}\n  ${group.detail}\n  ${group.cases.slice(0, 4).join(" ; ")}${group.cases.length > 4 ? ` … (${group.cases.length} cas)` : ""}`);
}
for (const entry of stale) console.log(`\nÉcart accepté qui ne se produit plus, à retirer : ${entry.key}`);
console.log(`\nÉcarts : ${groups.length}, acceptés : ${groups.length - open.length}, à corriger : ${open.length}.`);
console.log(`Détail : ${join(outputDirectory, "findings.json")}`);
process.exitCode = open.length || stale.length || missing.length ? 1 : 0;
