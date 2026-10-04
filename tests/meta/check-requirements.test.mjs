import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { validateRequirements } from "../../scripts/checks/check-requirements.mjs";

function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), "hall-requirements-"));
  mkdirSync(join(root, "packages/server/src"), { recursive: true });
  mkdirSync(join(root, "backlog"), { recursive: true });
  const file = join(root, "packages/server/src/model.ts");
  writeFileSync(file, "// @functional-requirement HALL-FR-LOC-010 LOCATION_BELONGS_TO_HALL:\n");
  const source = {
    kind: "legislation",
    citation: "CGCT L2121-17",
    localization: "alinéa 1",
    url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006389875",
    versionId: "LEGIARTI000006389875",
    validFrom: "1996-02-24",
    verifiedAt: "2026-09-06",
    asOf: "2026-09-06",
    scope: "Ordinary quorum",
  };
  const registry = {
    schemaVersion: 2,
    taxonomy: {
      themes: { locations: { label: "Lieux", description: "Lieux de Hall" } },
      prefixThemes: { LOC: "locations" },
      requirementThemes: {},
    },
    sources: { S1: source },
    requirements: {
      "HALL-FR-LOC-010": {
        name: "LOCATION_BELONGS_TO_HALL",
        nature: "functional",
        lifecycle: { state: "accepted", since: "2026-09-06" },
        statement: "Le lieu appartient à Hall.",
        acceptanceCriteria: ["Un lieu créé dans Hall appartient à ce Hall."],
        clauses: [{ key: "storage", origin: "product", statement: "Hall ownership", sourceIds: [] }],
      },
    },
  };
  try {
    fn({ root, file, registry, entry: registry.requirements["HALL-FR-LOC-010"] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
test("discovers embedded TypeScript SQL requirements and explicit same-name references", () =>
  fixture(({ root, file, registry }) => {
    writeFileSync(
      file,
      "export const sql=`\n-- @functional-requirement HALL-FR-LOC-010 LOCATION_BELONGS_TO_HALL:\n-- @requirement-reference HALL-FR-LOC-010 LOCATION_BELONGS_TO_HALL:\n`;\n",
    );
    const result = validateRequirements(root, registry);
    assert.deepEqual(result.errors, []);
    assert.equal(result.references, 1);
  }));
test("rejects unknown or absent origin without defaulting to product", () =>
  fixture(({ root, registry, entry }) => {
    delete entry.clauses[0].origin;
    assert.throws(() => validateRequirements(root, registry));
    entry.clauses[0].origin = "mixed";
    assert.throws(() => validateRequirements(root, registry));
  }));
test("requires resolved sources and version metadata for regulatory clauses", () =>
  fixture(({ root, registry, entry }) => {
    entry.clauses = [
      {
        key: "legal",
        origin: "regulatory",
        statement: "Explicit proposition",
        sourceIds: ["missing"],
        assessment: "verified",
        interpretation: "direct",
      },
    ];
    assert.match(validateRequirements(root, registry).errors.join("\n"), /unresolved source/);
    entry.clauses[0].sourceIds = ["S1"];
    delete registry.sources.S1.validFrom;
    assert.throws(() => validateRequirements(root, registry));
  }));
test("reports unproven legal propositions without pretending that structural success verifies them", () =>
  fixture(({ root, registry, entry }) => {
    entry.clauses = [
      {
        key: "legal",
        origin: "regulatory",
        statement: "Unsettled interpretation",
        sourceIds: ["S1"],
        assessment: "unproven",
        interpretation: "interpreted",
      },
    ];
    const result = validateRequirements(root, registry);
    assert.deepEqual(result.errors, []);
    assert.equal(result.unproven.length, 1);
  }));
test("accepts planned catalog entries and rejects conflicting implemented identity", () =>
  fixture(({ root, file, registry }) => {
    writeFileSync(file, "// @functional-requirement HALL-FR-LOC-020 DIFFERENT:\n");
    assert.match(validateRequirements(root, registry).errors.join("\n"), /unknown requirement/);
    writeFileSync(file, "// @functional-requirement HALL-FR-LOC-010 DIFFERENT:\n");
    assert.match(validateRequirements(root, registry).errors.join("\n"), /identity differs/);
  }));
test("does not hide duplicate definitions or malformed legacy annotations", () =>
  fixture(({ root, file, registry }) => {
    writeFileSync(
      file,
      "// @functional-requirement HALL-FR-LOC-010 LOCATION_BELONGS_TO_HALL:\n// @functional-requirement HALL-FR-LOC-010 LOCATION_BELONGS_TO_HALL:\n// FR-HALL-LOCATION-001: old\n",
    );
    const errors = validateRequirements(root, registry).errors.join("\n");
    assert.match(errors, /duplicate definition/);
    assert.match(errors, /malformed/);
  }));

test("rejects sources later than the legal date or verification date", () =>
  fixture(({ root, registry }) => {
    registry.sources.S1.validFrom = "2026-09-07";
    assert.match(validateRequirements(root, registry).errors.join("\n"), /after asOf/);
    const { versionId, validFrom, ...base } = registry.sources.S1;
    registry.sources.S1 = { ...base, kind: "caseLaw", decisionDate: "2026-09-07" };
    assert.match(validateRequirements(root, registry).errors.join("\n"), /after asOf/);
    registry.sources.S1.decisionDate = "2026-09-01";
    registry.sources.S1.verifiedAt = "2026-09-05";
    assert.match(validateRequirements(root, registry).errors.join("\n"), /verification date/);
  }));
test("rejects malformed explicit references instead of silently dropping them", () =>
  fixture(({ root, file, registry }) => {
    writeFileSync(
      file,
      "// @functional-requirement HALL-FR-LOC-010 LOCATION_BELONGS_TO_HALL:\n// @requirement-reference HALL-FR-LOC-010 missing-name\n",
    );
    assert.match(validateRequirements(root, registry).errors.join("\n"), /malformed/);
  }));
test("collects simplified implementation, verification and backlog tracking evidence", () =>
  fixture(({ root, file, registry }) => {
    mkdirSync(join(root, "packages/client/e2e"), { recursive: true });
    mkdirSync(join(root, "backlog"), { recursive: true });
    writeFileSync(file, "// @implements-requirement HALL-FR-LOC-010\n");
    writeFileSync(join(root, "packages/client/e2e/location.spec.ts"), "// @verifies-requirement HALL-FR-LOC-010\n");
    writeFileSync(join(root, "backlog/backlog.md"), "<!-- @tracks-requirement HALL-FR-LOC-010 -->\n");
    const result = validateRequirements(root, registry);
    assert.deepEqual(result.errors, []);
    assert.equal(result.implementations, 1);
    assert.equal(result.verifications, 1);
    assert.equal(result.tracked, 1);
  }));
test("requires every catalog entry to resolve to a declared theme", () =>
  fixture(({ root, registry }) => {
    registry.taxonomy.prefixThemes = {};
    assert.match(validateRequirements(root, registry).errors.join("\n"), /no theme classification/);
  }));
test("requires the same descriptive structure for every catalog entry", () =>
  fixture(({ root, registry, entry }) => {
    for (const field of ["statement", "acceptanceCriteria", "lifecycle"]) {
      const value = entry[field];
      delete entry[field];
      assert.throws(() => validateRequirements(root, registry));
      entry[field] = value;
    }
  }));
