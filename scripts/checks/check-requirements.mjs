import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const text = z.string().trim().min(1);
const day = z.iso.date();
const requirementId = z.string().regex(/^HALL-(?:FR|TR)-[A-Z]+-\d{3}$/);
const themeId = z.string().regex(/^[a-z][a-z0-9-]*$/);
const sourceBase = {
  citation: text,
  localization: text,
  url: z.url().refine((value) => {
    const host = new URL(value).hostname;
    return host === "legifrance.gouv.fr" || host.endsWith(".legifrance.gouv.fr") || host === "www.conseil-etat.fr";
  }, "Source must use a supported official legal publisher"),
  verifiedAt: day,
  asOf: day,
  scope: text,
};
const sourceSchema = z.discriminatedUnion("kind", [
  z.object({ ...sourceBase, kind: z.literal("legislation"), versionId: text, validFrom: day }).strict(),
  z.object({ ...sourceBase, kind: z.literal("caseLaw"), decisionDate: day }).strict(),
]);
const clauseSchema = z.discriminatedUnion("origin", [
  z.object({ key: text, origin: z.literal("product"), statement: text, sourceIds: z.array(text).length(0) }).strict(),
  z
    .object({
      key: text,
      origin: z.literal("regulatory"),
      statement: text,
      sourceIds: z.array(text).min(1),
      assessment: z.enum(["verified", "unproven"]),
      interpretation: z.enum(["direct", "interpreted"]),
    })
    .strict(),
]);
const lifecycleSchema = z
  .object({
    state: z.enum(["draft", "accepted", "retired"]),
    since: day,
  })
  .strict();
const themeSchema = z.object({ label: text, description: text }).strict();

export const requirementsRegistrySchema = z
  .object({
    schemaVersion: z.literal(2),
    taxonomy: z
      .object({
        themes: z.record(themeId, themeSchema),
        prefixThemes: z.record(z.string().regex(/^[A-Z]+$/), themeId),
        requirementThemes: z.record(requirementId, themeId),
      })
      .strict(),
    sources: z.record(text, sourceSchema),
    requirements: z.record(
      requirementId,
      z
        .object({
          name: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
          nature: z.enum(["functional", "technical"]),
          lifecycle: lifecycleSchema,
          statement: text,
          acceptanceCriteria: z.array(text).min(1),
          clauses: z.array(clauseSchema).min(1),
        })
        .strict(),
    ),
  })
  .strict();

const ignoredDirectories = new Set([
  "node_modules",
  "dist",
  ".git",
  "coverage",
  "test-results",
  "playwright-report",
  ".stryker-tmp",
]);

function filesBelow(directory, extensions, ignored = ignoredDirectories) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return [];
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return filesBelow(path, extensions, ignored);
    return extensions.test(entry.name) ? [path] : [];
  });
}

function classifyFile(root, path) {
  const location = relative(root, path);
  const isTest = /(^|\/)(?:test|tests|__tests__|e2e)(\/|$)|\.(?:test|spec)\./.test(location);
  return isTest ? "test" : "production";
}

function prefixOf(id) {
  return id.match(/^HALL-(?:FR|TR)-([A-Z]+)-/)?.[1];
}

export function resolveRequirementTheme(registry, id) {
  return registry.taxonomy.requirementThemes[id] ?? registry.taxonomy.prefixThemes[prefixOf(id)];
}

function discoverEvidence(root) {
  const records = [];
  const errors = [];
  const packageRoot = resolve(root, "packages");
  const backlogRoot = resolve(root, "backlog");
  const packageFiles = filesBelow(packageRoot, /\.(sql|ts|tsx|js|mjs)$/);
  const backlogFiles = filesBelow(backlogRoot, /\.md$/);

  for (const path of [...packageFiles, ...backlogFiles]) {
    const category = path.startsWith(backlogRoot) ? "backlog" : classifyFile(root, path);
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      const location = `${relative(root, path)}:${index + 1}`;
      const legacy = line.match(
        /@(functional-requirement|technical-requirement|requirement-reference)\s+(HALL-(FR|TR)-[A-Z]+-\d{3})\s+([A-Z][A-Z0-9_]+):/,
      );
      const simplified = line.match(
        /@(implements-requirement|verifies-requirement|tracks-requirement)\s+(HALL-(?:FR|TR)-[A-Z]+-\d{3})\b/,
      );
      const hasMarker =
        /@(?:(?:functional|technical)-requirement|requirement-reference|implements-requirement|verifies-requirement|tracks-requirement)\b/.test(
          line,
        );
      if (/FR-HALL-[A-Z]+-\d+/.test(line) || (hasMarker && !legacy && !simplified)) {
        errors.push(`${location}: malformed requirement annotation`);
      }
      if (legacy) {
        const [, kind, id, idNature, name] = legacy;
        records.push({
          kind: kind === "requirement-reference" ? (category === "test" ? "verification" : "reference") : "definition",
          id,
          idNature,
          name,
          location,
          category,
        });
      } else if (simplified) {
        const [, marker, id] = simplified;
        const kind =
          marker === "implements-requirement"
            ? "implementation"
            : marker === "verifies-requirement"
              ? "verification"
              : "tracking";
        records.push({ kind, id, location, category });
      }
    });
  }
  return { records, errors };
}

export function validateRequirements(root, rawRegistry) {
  const registry = requirementsRegistrySchema.parse(rawRegistry);
  const definitions = new Map();
  const evidence = new Map(
    Object.keys(registry.requirements).map((id) => [
      id,
      {
        id,
        theme: resolveRequirementTheme(registry, id),
        definitions: [],
        implementations: [],
        verifications: [],
        references: [],
        tracking: [],
      },
    ]),
  );
  const errors = [];
  const unproven = [];

  for (const [prefix, theme] of Object.entries(registry.taxonomy.prefixThemes)) {
    if (!registry.taxonomy.themes[theme]) errors.push(`${prefix}: unresolved theme ${theme}`);
  }
  for (const [id, theme] of Object.entries(registry.taxonomy.requirementThemes)) {
    if (!registry.requirements[id]) errors.push(`${id}: theme override targets an unknown requirement`);
    if (!registry.taxonomy.themes[theme]) errors.push(`${id}: unresolved theme ${theme}`);
  }
  for (const [id, source] of Object.entries(registry.sources)) {
    const effectiveDate = source.kind === "legislation" ? source.validFrom : source.decisionDate;
    if (effectiveDate > source.asOf) errors.push(`${id}: source takes effect after asOf`);
    if (source.asOf > source.verifiedAt) errors.push(`${id}: asOf is later than verification date`);
  }

  const discovered = discoverEvidence(root);
  errors.push(...discovered.errors);
  for (const record of discovered.records) {
    const metadata = registry.requirements[record.id];
    if (!metadata) {
      errors.push(`${record.location}: unknown requirement ${record.id}`);
      continue;
    }
    const evidenceKey = {
      definition: "definitions",
      implementation: "implementations",
      verification: "verifications",
      reference: "references",
      tracking: "tracking",
    }[record.kind];
    evidence.get(record.id)?.[evidenceKey]?.push(record.location);
    if (record.kind !== "definition") continue;
    const nature = record.idNature === "FR" ? "functional" : record.idNature === "TR" ? "technical" : undefined;
    if (record.category !== "production")
      errors.push(`${record.location}: requirement definition must be in production code`);
    if ((nature === "functional" ? "FR" : "TR") !== record.idNature)
      errors.push(`${record.location}: nature/ID mismatch`);
    if (definitions.has(record.id))
      errors.push(
        `${record.location}: duplicate definition ${record.id}; use an explicit reference for the same requirement`,
      );
    definitions.set(record.id, { name: record.name, nature, location: record.location });
    if (metadata.name !== record.name || metadata.nature !== nature)
      errors.push(`${record.id}: metadata identity differs from production`);
  }

  for (const [id, metadata] of Object.entries(registry.requirements)) {
    if (!resolveRequirementTheme(registry, id)) errors.push(`${id}: no theme classification`);
    const keys = new Set();
    for (const clause of metadata.clauses) {
      if (keys.has(clause.key)) errors.push(`${id}: duplicate clause key ${clause.key}`);
      keys.add(clause.key);
      for (const sourceId of clause.sourceIds) {
        if (!registry.sources[sourceId]) errors.push(`${id}/${clause.key}: unresolved source ${sourceId}`);
      }
      if (clause.origin === "regulatory" && clause.assessment === "unproven")
        unproven.push(`${id}/${clause.key}: ${clause.statement}`);
    }
  }

  for (const record of discovered.records.filter((item) => item.name && item.kind !== "definition")) {
    if (registry.requirements[record.id]?.name !== record.name)
      errors.push(`${record.location}: unresolved or conflicting reference ${record.id}`);
  }
  const evidenceList = [...evidence.values()].map((item) => ({
    ...item,
    implemented: item.definitions.length > 0 || item.implementations.length > 0,
    verified: item.verifications.length > 0,
    tracked: item.tracking.length > 0,
  }));
  return {
    errors,
    unproven,
    definitions: definitions.size,
    implementations: evidenceList.filter((item) => item.implemented).length,
    verifications: evidenceList.filter((item) => item.verified).length,
    tracked: evidenceList.filter((item) => item.tracked).length,
    references: discovered.records.filter((item) => ["reference", "verification"].includes(item.kind)).length,
    requirements: Object.keys(registry.requirements).length,
    sources: Object.keys(registry.sources).length,
    evidence: evidenceList,
  };
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    const root = resolve(dirname(scriptPath), "../..");
    const registry = JSON.parse(readFileSync(resolve(root, "requirements/catalog.json"), "utf8"));
    const result = validateRequirements(root, registry);
    for (const error of result.errors) console.error(error);
    for (const item of result.unproven) console.warn(`UNPROVEN: ${item}`);
    if (result.errors.length) process.exitCode = 1;
    else
      console.log(
        `Requirements structure OK: ${result.requirements} catalog entries, ${result.implementations} implemented, ${result.verifications} verified, ${result.tracked} tracked, ${result.sources} legal sources; ${result.unproven.length} explicitly unproven clauses. This is not legal or behavioral certification.`,
      );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
