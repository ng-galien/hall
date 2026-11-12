import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { conformanceRules } from "../engine/conformance.mjs";
import { groupFindings, intervalLabel, intervalsOf, sweepRules } from "../engine/sweep.mjs";
import { screens } from "./screens.mjs";
import { sourcesOf, sweepPlan } from "./sweep-config.mjs";

/*
 * Width sweep of the Hall screens: runs the sweep journeys on the disposable instance, groups the findings by
 * interval between width thresholds and compares them with the accepted list. Every accepted line carries its reason.
 * Exits with status 1 for a finding that is not accepted, an accepted line without a reason, an accepted line that no
 * longer matches anything, or a screen that did not open.
 * Options: --screens=a,b (only these screens), --report-only (reuse the last measurements).
 */

const here = import.meta.dirname;
const clientDirectory = resolve(here, "../../..");
const outputDirectory = resolve(clientDirectory, "test-results/screen-audit-sweep");
const acceptedFile = resolve(here, "sweep-accepted.json");
const argument = (name) => process.argv.find((entry) => entry.startsWith(`--${name}=`))?.split("=")[1] ?? null;
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
      // The sweep lasts longer than the ten minutes the runner gives a local suite: it takes the time of a CI run.
      CI: process.env.CI ?? "true",
      HALL_SCREEN_AUDIT_OUTPUT: outputDirectory,
      HALL_E2E_LANES: process.env.HALL_E2E_LANES ?? "3",
      ...(selected ? { HALL_SCREEN_AUDIT_SCREENS: selected } : {}),
    },
    stdio: "inherit",
  });
  if (result.status !== 0) console.error(`Le balayage s'est terminé avec le statut ${result.status}.`);
}
const seconds = Math.round((Date.now() - started) / 1000);

const sweepDirectory = join(outputDirectory, "sweep");
const records = existsSync(sweepDirectory)
  ? readdirSync(sweepDirectory)
      .filter((file) => file.endsWith(".json"))
      .map((file) => JSON.parse(readFileSync(join(sweepDirectory, file), "utf8")))
  : [];
const measures = records.reduce((total, record) => total + record.measures, 0);
const expected = screens.filter((screen) => !selected || selected.split(",").includes(screen.id));
const measuredBy = (input) => new Set(records.filter((record) => record.input === input).flatMap((record) => record.screens));
const missing = [
  ...records.flatMap((record) => record.missing),
  ...expected
    .filter((screen) => !measuredBy("pointer").has(screen.id))
    .map((screen) => `${screen.id} (souris) : non mesuré, balayage interrompu`),
  ...expected
    .filter((screen) => screen.formats.some((format) => format !== "ordinateur") && !measuredBy("touch").has(screen.id))
    .map((screen) => `${screen.id} (doigt) : non mesuré, balayage interrompu`),
];

/* Thresholds: every width threshold read in the loaded style sheets and in the scripts, with its origin. */
const breakpoints = new Map();
for (const entry of records.flatMap((record) => record.breakpoints ?? []))
  breakpoints.set(`${entry.kind}|${entry.breakpoint}|${entry.query}`, {
    ...entry,
    source: sourcesOf(entry).join(", "),
  });
const thresholdList = [...breakpoints.values()].sort(
  (a, b) => a.breakpoint - b.breakpoint || a.kind.localeCompare(b.kind),
);
const intervals = intervalsOf(
  thresholdList.filter((entry) => entry.kind !== "container").map((entry) => entry.breakpoint),
  sweepPlan.from,
  sweepPlan.to,
);

const groups = groupFindings(
  records.flatMap((record) => record.findings),
  intervals,
);
const accepted = JSON.parse(readFileSync(acceptedFile, "utf8")).accepted;
const withoutReason = accepted.filter((entry) => !entry.reason?.trim());
const acceptedKeys = new Map(accepted.map((entry) => [entry.key, entry.reason]));
const measuredScreens = new Set(records.flatMap((record) => record.screens));
const open = groups.filter((group) => !acceptedKeys.get(group.key)?.trim());
const stale = accepted.filter(
  (entry) => measuredScreens.has(entry.key.split(" | ")[0]) && !groups.some((group) => group.key === entry.key),
);

/* Width of the content area for each state of the panels, at both ends of each interval, over all screens. */
const content = new Map();
for (const entry of records.flatMap((record) => record.contentWidths ?? [])) {
  if (entry.content == null) continue;
  const key = `${entry.input === "touch" ? "doigt" : "souris"}, menu ${entry.menu}, volet ${entry.pane} | ${intervalLabel(intervals, entry.width)} | ${entry.width} px`;
  const range = content.get(key) ?? { min: Infinity, max: -Infinity, menus: new Set(), panes: new Set() };
  range.min = Math.min(range.min, entry.content);
  range.max = Math.max(range.max, entry.content);
  range.menus.add(entry.menu === "—" ? (entry.menuWidth ?? "—") : String(entry.menuWidth ?? "absent"));
  range.panes.add(String(entry.paneWidth ?? "absent"));
  content.set(key, range);
}

const titles = { ...sweepRules, ...conformanceRules };
const lines = [];
const say = (line = "") => lines.push(line);
say(`Balayage : ${measuredScreens.size} écrans, ${measures} mesures, ${seconds} s.`);
say(`\nSeuils de largeur relevés (${thresholdList.length}, première largeur de la plage ouverte) :`);
for (const entry of thresholdList)
  say(
    `  ${entry.breakpoint} px  ${entry.kind === "media" ? "@media" : entry.kind === "container" ? `@container${entry.container ? ` ${entry.container}` : ""}` : "script"}  ${entry.query}  (${entry.source})`,
  );
say(
  `\nIntervalles de la fenêtre (${intervals.length}) : ${intervals.map((entry) => `de ${entry.from} à ${entry.to} px`).join(" ; ")}`,
);
say("\nLargeur de la zone de contenu (plus petite et plus grande sur les écrans) :");
for (const [key, range] of [...content.entries()].sort())
  say(
    `  ${key} : contenu ${range.min === range.max ? range.min : `${range.min} à ${range.max}`} px (menu dessiné ${[...range.menus].join(" ou ")} px, volet ${[...range.panes].join(" ou ")} px)`,
  );
say("\nÉcarts par règle :");
for (const [rule, title] of Object.entries(titles)) {
  const count = groups.filter((group) => group.rule === rule).length;
  if (count) say(`  ${rule} (${title}) : ${count}`);
}
for (const line of missing) say(`Écran non ouvert : ${line}`);
for (const group of open)
  say(
    `\nÉcart : ${group.key}\n  ${titles[group.rule] ?? group.rule} — ${group.detail}\n  ${group.cases.slice(0, 4).join(" ; ")}${group.cases.length > 4 ? ` … (${group.cases.length} cas)` : ""}`,
  );
for (const entry of withoutReason) say(`\nÉcart accepté sans raison écrite, refusé : ${entry.key}`);
for (const entry of stale) say(`\nÉcart accepté qui ne se produit plus, à retirer : ${entry.key}`);
say(`\nÉcarts : ${groups.length}, acceptés avec raison : ${groups.length - open.length}, à corriger : ${open.length}.`);
say(`Détail : ${join(outputDirectory, "findings.json")}`);

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(
  join(outputDirectory, "findings.json"),
  `${JSON.stringify({ seconds, measures, missing, thresholds: thresholdList, intervals, content: Object.fromEntries([...content].map(([key, range]) => [key, { ...range, menus: [...range.menus], panes: [...range.panes] }])), groups }, null, 2)}\n`,
);
writeFileSync(join(outputDirectory, "report.txt"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
process.exitCode = open.length || stale.length || missing.length || withoutReason.length ? 1 : 0;
