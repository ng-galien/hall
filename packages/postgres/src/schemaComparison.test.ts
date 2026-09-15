import { describe, expect, it, vi } from "vitest";
import {
  assertHallSchemaUpgradeCodeMoniker,
  hallCatalogDocuments,
  hallManifestDocuments,
  inspectHallSchemaUpgrade,
} from "./schemaComparison.js";
import { defineSchemaManifest } from "./schemaManifest.js";

describe("Hall schema comparisons", () => {
  it("refuses a Code Moniker runtime that cannot prove the structural capability probe", async () => {
    const compare = vi.fn().mockResolvedValue({
      diagnostics: [],
      symbol_changes: [
        {
          kind: "removed",
          old: {
            identity: "code-moniker://probe/schema:hall/table:capability_probe/column:value",
            compact_identity: "sql:schema:hall/table:capability_probe/column:value",
            kind: "column",
          },
        },
      ],
      ref_changes: [],
    });

    await expect(assertHallSchemaUpgradeCodeMoniker({ diffImpact: { compare } })).rejects.toThrow(
      "cannot compare Hall PostgreSQL schemas reliably",
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
    const compare = vi.fn().mockResolvedValue({ diagnostics: [], symbol_changes: [], ref_changes: [] });

    const inspection = await inspectHallSchemaUpgrade({ diffImpact: { compare } }, installed, target, manifest);

    expect(inspection.verdicts.map((verdict) => verdict.name)).toEqual([
      "manifest-to-materialized-target",
      "installed-to-target",
    ]);
    expect(inspection.installedCatalog.tables).toEqual([]);
    expect(inspection.targetCatalog.tables).toEqual([]);
    expect(compare).toHaveBeenCalledTimes(2);
  });
});
