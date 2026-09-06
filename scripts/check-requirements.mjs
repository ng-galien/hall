import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const text = z.string().trim().min(1);
const day = z.iso.date();
const sourceBase = { citation: text, localization: text, url: z.url().refine(value => {
  const host = new URL(value).hostname;
  return host === "legifrance.gouv.fr" || host.endsWith(".legifrance.gouv.fr") || host === "www.conseil-etat.fr";
}, "Source must use a supported official legal publisher"), verifiedAt: day, asOf: day, scope: text };
const sourceSchema = z.discriminatedUnion("kind", [
  z.object({ ...sourceBase, kind: z.literal("legislation"), versionId: text, validFrom: day }).strict(),
  z.object({ ...sourceBase, kind: z.literal("caseLaw"), decisionDate: day }).strict(),
]);
const clauseSchema = z.discriminatedUnion("origin", [
  z.object({ key: text, origin: z.literal("product"), statement: text, sourceIds: z.array(text).length(0) }).strict(),
  z.object({ key: text, origin: z.literal("regulatory"), statement: text, sourceIds: z.array(text).min(1),
    assessment: z.enum(["verified", "unproven"]), interpretation: z.enum(["direct", "interpreted"]) }).strict(),
]);
export const requirementsRegistrySchema = z.object({ schemaVersion: z.literal(1), sources: z.record(text, sourceSchema),
  requirements: z.record(z.string().regex(/^HALL-(?:FR|TR)-[A-Z]+-\d{3}$/), z.object({
    name: z.string().regex(/^[A-Z][A-Z0-9_]+$/), nature: z.enum(["functional", "technical"]),
    clauses: z.array(clauseSchema).min(1),
  }).strict()),
}).strict();

function productionFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (["node_modules", "dist", "test", "tests", "__tests__", "e2e", ".git"].includes(entry.name)) return [];
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return productionFiles(path);
    return /\.(sql|ts|tsx|js|mjs)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name) ? [path] : [];
  });
}

export function validateRequirements(root, rawRegistry) {
  const registry = requirementsRegistrySchema.parse(rawRegistry);
  const definitions = new Map();
  const references = [];
  const errors = [];
  const unproven = [];
  for (const [id, source] of Object.entries(registry.sources)) {
    const effectiveDate = source.kind === "legislation" ? source.validFrom : source.decisionDate;
    if (effectiveDate > source.asOf) errors.push(`${id}: source takes effect after asOf`);
    if (source.asOf > source.verifiedAt) errors.push(`${id}: asOf is later than verification date`);
  }
  for (const path of productionFiles(resolve(root, "packages"))) {
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      const location = `${relative(root, path)}:${index + 1}`;
      const marker = line.match(/@(functional-requirement|technical-requirement|requirement-reference)\s+(HALL-(FR|TR)-[A-Z]+-\d{3})\s+([A-Z][A-Z0-9_]+):/);
      if (/FR-HALL-[A-Z]+-\d+/.test(line) || (/^\s*(?:--|\/\/|\*)\s*@(?:(?:functional|technical)-requirement|requirement-reference)\b/.test(line) && !marker)) {
        errors.push(`${location}: malformed requirement annotation`);
      }
      if (!marker) return;
      const [, kind, id, prefix, name] = marker;
      if (kind === "requirement-reference") { references.push({ id, name, location }); return; }
      const nature = kind === "functional-requirement" ? "functional" : "technical";
      if ((nature === "functional" ? "FR" : "TR") !== prefix) errors.push(`${location}: nature/ID mismatch`);
      if (definitions.has(id)) errors.push(`${location}: duplicate definition ${id}; use an explicit reference for the same requirement`);
      definitions.set(id, { name, nature, location });
    });
  }
  for (const [id, definition] of definitions) {
    const metadata = registry.requirements[id];
    if (!metadata) { errors.push(`${id}: metadata missing (${definition.location})`); continue; }
    if (metadata.name !== definition.name || metadata.nature !== definition.nature) errors.push(`${id}: metadata identity differs from production`);
    const keys = new Set();
    for (const clause of metadata.clauses) {
      if (keys.has(clause.key)) errors.push(`${id}: duplicate clause key ${clause.key}`);
      keys.add(clause.key);
      for (const sourceId of clause.sourceIds) {
        if (!registry.sources[sourceId]) errors.push(`${id}/${clause.key}: unresolved source ${sourceId}`);
      }
      if (clause.origin === "regulatory" && clause.assessment === "unproven") unproven.push(`${id}/${clause.key}: ${clause.statement}`);
    }
  }
  for (const id of Object.keys(registry.requirements)) if (!definitions.has(id)) errors.push(`${id}: orphan metadata`);
  for (const reference of references) {
    if (definitions.get(reference.id)?.name !== reference.name) errors.push(`${reference.location}: unresolved or conflicting reference ${reference.id}`);
  }
  return { errors, unproven, definitions: definitions.size, references: references.length, sources: Object.keys(registry.sources).length };
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    const root = resolve(dirname(scriptPath), "..");
    const registry = JSON.parse(readFileSync(resolve(root, "packages/postgres/requirements.json"), "utf8"));
    const result = validateRequirements(root, registry);
    for (const error of result.errors) console.error(error);
    for (const item of result.unproven) console.warn(`UNPROVEN: ${item}`);
    if (result.errors.length) process.exitCode = 1;
    else console.log(`Requirements structure OK: ${result.definitions} definitions, ${result.references} references, ${result.sources} legal sources; ${result.unproven.length} explicitly unproven clauses. This is not legal or behavioral certification.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
