import { comparePostgresStructures, type PostgresStructureComparison } from "@ng-galien/postgresql-catalog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertHallSchemaUpgradeCodeMoniker,
  hallCatalogDocuments,
  hallManifestDocuments,
  inspectHallSchemaUpgrade,
} from "./schemaComparison.js";
import { defineSchemaManifest } from "./schemaManifest.js";

vi.mock("@ng-galien/postgresql-catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ng-galien/postgresql-catalog")>()),
  comparePostgresStructures: vi.fn(),
}));

const compareStructures = vi.mocked(comparePostgresStructures);
beforeEach(() => compareStructures.mockReset());

describe("Hall schema comparisons", () => {
  it("refuses a Code Moniker runtime that cannot prove the structural capability probe", async () => {
    compareStructures.mockResolvedValue(comparison(false));
    const client = { diffImpact: { compare: vi.fn() }, queryData: vi.fn() };

    await expect(assertHallSchemaUpgradeCodeMoniker(client)).rejects.toThrow(
      "cannot compare Hall PostgreSQL schemas reliably",
    );
    expect(compareStructures).toHaveBeenCalledWith(
      client,
      expect.any(Array),
      expect.any(Array),
      "hall-schema-upgrade-capability-probe",
      "structure",
      expect.objectContaining({ parse: expect.any(Function) }),
    );
  });

  it("keeps the three Hall schemas and excludes public catalog objects", () => {
    const documents = ["hall", "hall_api", "hall_meta", "public"].map((schema, oid) => ({
      uri: `${schema}.sql`,
      language: "sql" as const,
      content: `CREATE SCHEMA ${schema};`,
      postgres: {
        connectionId: "test",
        database: "hall",
        schema,
        documentKind: "schema" as const,
        oid,
        name: schema,
        signature: "",
      },
    }));

    expect(hallCatalogDocuments(documents).map((document) => document.postgres?.schema)).toEqual([
      "hall",
      "hall_api",
      "hall_meta",
    ]);
  });

  it("declares the manifest, installed and target comparisons separately", async () => {
    const manifest = defineSchemaManifest([{ path: "sql/a.sql", sql: "CREATE SCHEMA hall;" }]);
    expect(hallManifestDocuments(manifest)).toEqual([
      { uri: "hall-manifest://schema.sql", language: "sql", content: "CREATE SCHEMA hall;\n" },
    ]);
    const catalogResult = {
      rows: [
        {
          schemas: [],
          types: [],
          tables: [],
          columns: [],
          constraints: [],
          indexes: [],
          views: [],
          routines: [],
          triggers: [],
          view_dependencies: [],
        },
      ],
    };
    const installed = { query: vi.fn().mockResolvedValue(catalogResult) };
    const target = { query: vi.fn().mockResolvedValue(catalogResult) };
    compareStructures.mockResolvedValue(comparison(true));
    const client = { diffImpact: { compare: vi.fn() }, queryData: vi.fn() };
    const inspection = await inspectHallSchemaUpgrade(client, installed, target, manifest);

    expect(inspection.verdicts.map((verdict) => verdict.name)).toEqual([
      "manifest-to-materialized-target",
      "installed-to-target",
    ]);
    expect(inspection.installedCatalog.tables).toEqual([]);
    expect(inspection.targetCatalog.tables).toEqual([]);
    expect(compareStructures).toHaveBeenCalledTimes(2);
    expect(compareStructures).toHaveBeenNthCalledWith(
      1,
      client,
      hallManifestDocuments(manifest),
      [],
      "manifest..materialized-target",
      "structure",
      expect.objectContaining({ parse: expect.any(Function) }),
    );
    expect(compareStructures).toHaveBeenNthCalledWith(2, client, [], [], "installed..target");
  });
});

function comparison(isomorphic: boolean): PostgresStructureComparison {
  return {
    isomorphic,
    onlyInBase: [],
    onlyInHead: [],
    changed: [],
    references: [],
    diagnostics: [],
    raw: { diagnostics: [], symbol_changes: [], ref_changes: [] },
  };
}
