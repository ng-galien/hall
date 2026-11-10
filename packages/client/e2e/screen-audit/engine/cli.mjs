import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compareWithBaseline, readBaseline, writeBaseline } from "./baseline.mjs";
import { evaluate } from "./evaluate.mjs";
import { writeReport } from "./report.mjs";
import { extractTexts } from "./texts.mjs";

/*
 * Command shared by every project. The project configuration supplies its name, formats, collection options, rule
 * settings, baseline file, message catalogue, manually observed defects and a `capture` function that opens its
 * screens and writes their records with `captureScreen`.
 *
 * Options: --report-only (reuse the last capture), --update-baseline, --screens=a,b, --formats=a,b,
 * --output=<directory>, --label=<text>, --compare-with=<directory of another report>.
 */

function parseArguments(argv) {
  const options = {};
  for (const argument of argv) {
    const [name, value] = argument.replace(/^--/, "").split("=");
    options[name] = value ?? true;
  }
  return options;
}

function readRecords(outputDirectory) {
  const records = [];
  const missing = [];
  const dataStrings = new Set();
  const raw = join(outputDirectory, "raw");
  if (!existsSync(raw)) return { records, missing, dataStrings };
  for (const format of readdirSync(raw)) {
    for (const file of readdirSync(join(raw, format))) {
      if (!file.endsWith(".json")) continue;
      const content = JSON.parse(readFileSync(join(raw, format, file), "utf8"));
      if (file.startsWith("data-strings.")) for (const value of content) dataStrings.add(value);
      else if (file.endsWith(".missing.json")) missing.push(content);
      else records.push(content);
    }
  }
  return { records, missing, dataStrings };
}

export async function runAudit(config, argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const outputDirectory = options.output ?? config.outputDirectory;
  const started = Date.now();
  let captureFailed = false;
  if (!options["report-only"]) {
    rmSync(outputDirectory, { recursive: true, force: true });
    try {
      await config.capture({
        outputDirectory,
        screens: typeof options.screens === "string" ? options.screens.split(",") : null,
        formats: typeof options.formats === "string" ? options.formats.split(",") : null,
      });
    } catch (error) {
      captureFailed = true;
      console.error(`La capture des écrans a échoué : ${error instanceof Error ? error.message : error}`);
    }
  }
  const { records, missing, dataStrings } = readRecords(outputDirectory);
  if (!records.length) {
    console.error("Aucun écran mesuré : pas de rapport.");
    process.exitCode = 1;
    return;
  }
  const evaluation = evaluate(records, config);
  const baselineFile = options.baseline ?? config.baselineFile;
  const measured = new Set(records.map((record) => `${record.format} | ${record.screen.id}`));
  const baseline = compareWithBaseline(evaluation.findings, readBaseline(baselineFile), measured);
  evaluation.resolved = baseline.resolved;
  const texts = extractTexts(records, { messages: config.messages ?? [], dataStrings });
  writeFileSync(join(outputDirectory, "textes.json"), `${JSON.stringify(texts, null, 2)}\n`);
  let comparison = null;
  if (typeof options["compare-with"] === "string") {
    const file = join(options["compare-with"], "confrontation.json");
    if (existsSync(file)) {
      const loaded = JSON.parse(readFileSync(file, "utf8"));
      comparison = Object.assign(loaded.result, { label: loaded.label });
    }
  }
  const label = typeof options.label === "string" ? options.label : undefined;
  const confrontation = writeReport({ outputDirectory, config, records, missing, evaluation, comparison, label });
  writeFileSync(
    join(outputDirectory, "confrontation.json"),
    JSON.stringify({ label: label ?? "autre état", result: confrontation }),
  );
  writeFileSync(
    join(outputDirectory, "findings.json"),
    JSON.stringify({ label, findings: evaluation.findings, metrics: evaluation.metrics }),
  );

  const byRule = new Map();
  for (const finding of evaluation.findings) {
    if (finding.exploratory) continue;
    byRule.set(finding.rule, (byRule.get(finding.rule) ?? 0) + 1);
  }
  console.log(`\nRevue des écrans : ${records.length} pages mesurées, ${missing.length} non ouvertes.`);
  for (const [rule, total] of [...byRule.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${rule} : ${total}`);
  console.log(`Écarts connus de la référence : ${baseline.known.length}.`);
  if (baseline.resolved.length) {
    console.log(`Lignes de la référence sans écart, à retirer (${baseline.resolved.length}) :`);
    for (const key of baseline.resolved.slice(0, 40)) console.log(`  - ${key}`);
  }
  if (options["update-baseline"]) {
    const total = writeBaseline(baselineFile, evaluation.findings);
    console.log(`Référence régénérée : ${total} écarts dans ${baselineFile}.`);
  } else if (baseline.fresh.length) {
    console.log(`Écarts absents de la référence (${baseline.fresh.length}) :`);
    for (const finding of baseline.fresh.slice(0, 60))
      console.log(`  + ${finding.key} : ${finding.value} ${finding.unit} (seuil ${finding.threshold})`);
  }
  for (const entry of missing) console.log(`Écran non ouvert : ${entry.format} ${entry.screen.id} : ${entry.error}`);
  console.log(`Rapport : ${join(outputDirectory, "index.html")}`);
  console.log(`Durée : ${Math.round((Date.now() - started) / 1000)} s.`);
  const failed = captureFailed || missing.length > 0 || (!options["update-baseline"] && baseline.fresh.length > 0);
  process.exitCode = failed ? 1 : 0;
}
