import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { conformanceRules, unityFindings } from "../engine/conformance.mjs";
import { groupFindings, intervalLabel, intervalsOf, sweepRules } from "../engine/sweep.mjs";
import { screensForFiles } from "./screen-map.mjs";
import { screens } from "./screens.mjs";
import { sourcesOf, sweepPlan } from "./sweep-config.mjs";

/*
 * Width sweep of the Hall screens: runs the sweep journeys on the disposable instance, groups the findings by
 * interval between width thresholds and compares them with the accepted list. Every accepted line carries its reason.
 * Exits with status 1 for a finding that is not accepted, an accepted line without a reason, an accepted line that no
 * longer matches anything, a screen that did not open, or a changed file that no line of screen-map.mjs names.
 * Options:
 *   --changed=<commit or range>  the screens concerned by the files of that commit (targeted pass);
 *   --files=a,b                  the screens concerned by these files;
 *   --screens=a,b                these screens;
 *   --intervals=761-1000,…       only the intervals that cross these window widths;
 *   --exclude=a,b                leave these screens out (their files are being changed);
 *   --widths=783,1030            measure only these window widths, with every rule;
 *   --commit=<commit>            the commit whose client is built and measured (HEAD by default);
 *   --build-only                 build the client of the commit and write its directory, for the journeys of a pass;
 *   --report-only                rewrite the report from the last measurements;
 *   --rules[=component]          write the rules of the interface (all, or one component), without a browser;
 *   --explain=<file or screen>   write the rules that apply to this file or screen.
 * Without --changed, --files or --screens, every screen is measured: the complete pass, before a release.
 */

const here = import.meta.dirname;
const clientDirectory = resolve(here, "../../..");
const outputDirectory = resolve(clientDirectory, "test-results/screen-audit-sweep");
const acceptedFile = resolve(here, "sweep-accepted.json");
const argument = (name) => process.argv.find((entry) => entry.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const reportOnly = process.argv.includes("--report-only");

/* --rules[=component] and --explain=<file or screen> write the rules of the interface and stop: no browser. */
if (
  process.argv.some((entry) => entry === "--rules" || entry.startsWith("--rules=") || entry.startsWith("--explain="))
) {
  const { explain, writeRules } = await import("./rules-text.mjs");
  console.log(
    argument("explain") ? explain(argument("explain")) : writeRules(argument("rules") ?? argument("component")),
  );
  process.exit(0);
}
const known = new Set(screens.map((screen) => screen.id));

/* Targeted pass: the screens of the changed files, or the declared sample of a shared component. */
let selected = argument("screens");
let unmapped = [];
const changedFiles = argument("changed")
  ? spawnSync(
      "git",
      [
        "diff",
        "--name-only",
        ...(argument("changed").includes("..")
          ? [argument("changed")]
          : [`${argument("changed")}^`, argument("changed")]),
      ],
      { cwd: resolve(clientDirectory, "../.."), encoding: "utf8" },
    )
      .stdout.split("\n")
      .filter(Boolean)
  : argument("files")?.split(",");
if (changedFiles) {
  const target = screensForFiles(changedFiles, known);
  unmapped = target.unmapped;
  for (const reason of target.reasons)
    console.log(
      `${reason.file} → ${reason.screens.join(", ")}${reason.component ? ` (échantillon : ${reason.component})` : ""}`,
    );
  for (const file of unmapped) console.log(`Fichier rattaché à aucun écran, à ajouter à screen-map.mjs : ${file}`);
  selected = [...new Set([...(selected ? selected.split(",") : []), ...target.screens])].join(",");
  if (!selected) console.log("Aucun écran de l'outil n'est concerné par ces fichiers.");
}
/* --exclude=a,b leaves out screens whose files are being changed by an implementer. */
const excluded = argument("exclude")?.split(",") ?? [];
for (const id of excluded) if (!known.has(id)) throw new Error(`Écran inconnu : ${id}`);
if (excluded.length) {
  selected = (selected ? selected.split(",") : [...known]).filter((id) => !excluded.includes(id)).join(",");
  console.log(`Écrans exclus de ce passage : ${excluded.join(", ")}`);
}
for (const id of selected ? selected.split(",") : []) if (!known.has(id)) throw new Error(`Écran inconnu : ${id}`);
const intervalsOption = argument("intervals");
const widthsOption = argument("widths");

/*
 * The measured client is built from a commit, never from the working tree: the commit is exported with `git archive`
 * outside the repository, its client is built there once and served by the journeys. The server and the database of
 * the disposable instance come from the packages built in the repository.
 */
const repository = resolve(clientDirectory, "../..");
const commit = spawnSync("git", ["rev-parse", "--short", argument("commit") ?? "HEAD"], {
  cwd: repository,
  encoding: "utf8",
}).stdout.trim();
function buildClient() {
  const root = resolve(process.env.HALL_SCREEN_AUDIT_BUILDS ?? join(tmpdir(), "hall-screen-audit-builds"), commit);
  const built = join(root, "client");
  if (existsSync(join(built, "index.html"))) return built;
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, "source"), { recursive: true });
  const archive = spawnSync("sh", ["-c", `git archive ${commit} | tar -x -C "${join(root, "source")}"`], {
    cwd: repository,
    stdio: "inherit",
  });
  if (archive.status !== 0) throw new Error(`git archive ${commit} a échoué`);
  for (const modules of ["node_modules", "packages/client/node_modules"])
    if (existsSync(join(repository, modules))) symlinkSync(join(repository, modules), join(root, "source", modules));
  console.log(`Construction du client de ${commit} dans ${built}`);
  const build = spawnSync(
    process.execPath,
    [join(repository, "node_modules/vite/bin/vite.js"), "build", "--outDir", built, "--emptyOutDir"],
    {
      cwd: join(root, "source", "packages/client"),
      env: { ...process.env, HALL_VITE_CACHE_DIR: join(root, "vite-cache") },
      stdio: "inherit",
    },
  );
  if (build.status !== 0) throw new Error(`La construction du client de ${commit} a échoué`);
  return built;
}

/* --build-only builds the client of the commit and writes its directory: the journeys of a pass are run on it. */
if (process.argv.includes("--build-only")) {
  console.log(buildClient());
  process.exit(0);
}

const started = Date.now();
if (!reportOnly && selected !== "") {
  /* The rules are proven on their faulty and correct pages before any measure. */
  const proof = spawnSync(process.execPath, [resolve(clientDirectory, "e2e/screen-audit/engine/sweep-self-test.mjs")], {
    stdio: "inherit",
  });
  if (proof.status !== 0) {
    console.error("Une règle ne passe pas sa preuve : le passage n'est pas lancé.");
    process.exit(1);
  }
  rmSync(outputDirectory, { recursive: true, force: true });
  const clientBuild = buildClient();
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(join(outputDirectory, "commit.txt"), `${commit}\n`);
  const result = spawnSync(process.execPath, [resolve(clientDirectory, "e2e/run.mjs")], {
    cwd: resolve(clientDirectory, "../.."),
    env: {
      ...process.env,
      HALL_SCREEN_AUDIT: "true",
      HALL_SCREEN_AUDIT_MODE: "sweep",
      // A complete sweep lasts longer than the ten minutes the runner gives a local suite: it takes the time of a CI run.
      CI: process.env.CI ?? "true",
      HALL_SCREEN_AUDIT_OUTPUT: outputDirectory,
      HALL_E2E_LANES: process.env.HALL_E2E_LANES ?? "2",
      ...(selected ? { HALL_SCREEN_AUDIT_SCREENS: selected } : {}),
      ...(intervalsOption ? { HALL_SCREEN_AUDIT_INTERVALS: intervalsOption } : {}),
      ...(widthsOption ? { HALL_SCREEN_AUDIT_WIDTHS: widthsOption } : {}),
      HALL_E2E_CLIENT_BUILD: clientBuild,
    },
    stdio: "inherit",
  });
  if (result.status !== 0) console.error(`Le balayage s'est terminé avec le statut ${result.status}.`);
}
const seconds = Math.round((Date.now() - started) / 1000);
const measuredCommit = existsSync(join(outputDirectory, "commit.txt"))
  ? readFileSync(join(outputDirectory, "commit.txt"), "utf8").trim()
  : commit;

const sweepDirectory = join(outputDirectory, "sweep");
const records = existsSync(sweepDirectory)
  ? readdirSync(sweepDirectory)
      .filter((file) => file.endsWith(".json"))
      .map((file) => JSON.parse(readFileSync(join(sweepDirectory, file), "utf8")))
  : [];
const measures = records.reduce((total, record) => total + record.measures, 0);
const expected =
  selected === "" ? [] : screens.filter((screen) => !selected || selected.split(",").includes(screen.id));
const measuredBy = (input) =>
  new Set(records.filter((record) => record.input === input).flatMap((record) => record.screens));
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
groups.push(
  ...unityFindings(
    records.flatMap((record) => record.unity ?? []),
    (width) => intervalLabel(intervals, width),
  ),
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

const titles = Object.fromEntries(
  Object.entries({ ...sweepRules, ...conformanceRules }).map(([rule, definition]) => [rule, definition.title]),
);
const lines = [];
const say = (line = "") => lines.push(line);
say(`Balayage du commit ${measuredCommit} : ${measuredScreens.size} écrans, ${measures} mesures, ${seconds} s.`);
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
if (existsSync(join(outputDirectory, "lenteurs.txt")))
  for (const line of readFileSync(join(outputDirectory, "lenteurs.txt"), "utf8").split("\n").filter(Boolean))
    say(`Étape lente : ${line}`);
for (const group of open)
  say(
    `\nÉcart : ${group.key}\n  ${titles[group.rule] ?? group.rule} — ${group.detail}\n  ${group.rule === "component-unity" ? group.cases.join("\n  ") : `${group.cases.slice(0, 4).join(" ; ")}${group.cases.length > 4 ? ` … (${group.cases.length} cas)` : ""}`}`,
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
process.exitCode = open.length || stale.length || missing.length || withoutReason.length || unmapped.length ? 1 : 0;
