import type { PostgresCatalogModel } from "@ng-galien/postgresql-catalog";
import { describe, expect, it } from "vitest";
import { HallSchemaUpgradePlanningError, planHallSchemaUpgrade } from "./schemaUpgrade.js";

const emptyCatalog = (): PostgresCatalogModel => ({
  schemas: [{ oid: "1", schemaName: "hall" }],
  types: [],
  tables: [],
  columns: [],
  constraints: [],
  indexes: [],
  views: [],
  routines: [],
  triggers: [],
  viewDependencies: [],
});

describe("Hall PostgreSQL schema upgrade planning", () => {
  it("adds and renames columns while preserving the table", () => {
    const installed = emptyCatalog();
    installed.tables.push({ tableOid: "10", schemaName: "hall", tableName: "contact" });
    installed.columns.push({
      tableOid: "10",
      schemaName: "hall",
      tableName: "contact",
      columnNumber: 1,
      columnName: "old_name",
      dataType: "text",
      notNull: true,
      identityKind: "",
      generatedKind: "",
    });
    const target = structuredClone(installed);
    target.columns[0] = { ...target.columns[0]!, columnName: "display_name", comment: "@hall renamed-from old_name" };
    target.columns.push({
      tableOid: "10",
      schemaName: "hall",
      tableName: "contact",
      columnNumber: 2,
      columnName: "archived",
      dataType: "boolean",
      notNull: true,
      defaultExpression: "false",
      identityKind: "",
      generatedKind: "",
    });

    expect(planHallSchemaUpgrade(installed, target).statements).toEqual([
      expect.objectContaining({
        kind: "rename-column",
        sql: 'ALTER TABLE "hall"."contact" RENAME COLUMN "old_name" TO "display_name";',
      }),
      expect.objectContaining({
        kind: "add-column",
        sql: 'ALTER TABLE "hall"."contact" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;',
      }),
      expect.objectContaining({
        kind: "comment-column",
        sql: 'COMMENT ON COLUMN "hall"."contact"."display_name" IS \'@hall renamed-from old_name\';',
      }),
    ]);
  });

  it("drops obsolete overloads exactly and replaces changed schema objects", () => {
    const installed = emptyCatalog();
    installed.routines.push(
      {
        oid: "20",
        schemaName: "hall",
        objectName: "save",
        definition: "CREATE FUNCTION hall.save(value text) RETURNS text LANGUAGE sql AS $$ SELECT value $$",
        identityArguments: "text",
        routineKind: "function",
      },
      {
        oid: "21",
        schemaName: "hall",
        objectName: "save",
        definition: "CREATE FUNCTION hall.save(value integer) RETURNS integer LANGUAGE sql AS $$ SELECT value $$",
        identityArguments: "integer",
        routineKind: "function",
      },
    );
    const target = emptyCatalog();
    target.routines.push({
      oid: "30",
      schemaName: "hall",
      objectName: "save",
      definition:
        "CREATE OR REPLACE FUNCTION hall.save(value text) RETURNS text LANGUAGE sql AS $$ SELECT trim(value) $$",
      identityArguments: "text",
      routineKind: "function",
    });

    expect(planHallSchemaUpgrade(installed, target).statements).toEqual([
      expect.objectContaining({ kind: "drop-routine", sql: 'DROP FUNCTION "hall"."save"(integer);' }),
      expect.objectContaining({
        kind: "create-routine",
        sql: expect.stringContaining("CREATE OR REPLACE FUNCTION hall.save"),
      }),
    ]);
  });

  it("adds enum values in target order", () => {
    const installed = emptyCatalog();
    installed.types.push({
      oid: "40",
      schemaName: "hall",
      objectName: "state",
      definition: "CREATE TYPE hall.state AS ENUM ('draft', 'closed')",
      identityArguments: "",
    });
    const target = emptyCatalog();
    target.types.push({
      oid: "41",
      schemaName: "hall",
      objectName: "state",
      definition: "CREATE TYPE hall.state AS ENUM ('draft', 'open', 'closed')",
      identityArguments: "",
    });

    expect(planHallSchemaUpgrade(installed, target).statements).toEqual([
      expect.objectContaining({
        kind: "alter-type",
        sql: "ALTER TYPE \"hall\".\"state\" ADD VALUE IF NOT EXISTS 'open' BEFORE 'closed';",
      }),
    ]);
  });

  it("replaces a changed view without dropping the row type used by dependent routines", () => {
    const installed = emptyCatalog();
    installed.views.push({
      oid: "50",
      schemaName: "hall",
      objectName: "resource_read_model",
      definition: "SELECT id, name FROM hall.resource",
      identityArguments: "",
    });
    const target = structuredClone(installed);
    target.views[0] = { ...target.views[0]!, definition: "SELECT id, trim(name) AS name FROM hall.resource" };

    expect(planHallSchemaUpgrade(installed, target).statements).toEqual([
      expect.objectContaining({
        kind: "create-view",
        sql: 'CREATE OR REPLACE VIEW "hall"."resource_read_model" AS SELECT id, trim(name) AS name FROM hall.resource;',
      }),
    ]);
  });

  it("drops a routine typed by an obsolete view before dropping that view", () => {
    const installed = emptyCatalog();
    installed.views.push({
      oid: "50",
      schemaName: "hall",
      objectName: "resource_read_model",
      definition: "SELECT id, name FROM hall.resource",
      identityArguments: "",
    });
    installed.routines.push({
      oid: "51",
      schemaName: "hall",
      objectName: "resource_presentation",
      definition:
        "CREATE FUNCTION hall.resource_presentation(target hall.resource_read_model) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$",
      identityArguments: "target hall.resource_read_model",
      routineKind: "function",
    });

    expect(planHallSchemaUpgrade(installed, emptyCatalog()).statements).toEqual([
      expect.objectContaining({
        kind: "drop-routine",
        sql: 'DROP FUNCTION "hall"."resource_presentation"(target hall.resource_read_model);',
      }),
      expect.objectContaining({ kind: "drop-view", sql: 'DROP VIEW "hall"."resource_read_model";' }),
    ]);
  });

  it("refuses an implicit column type conversion", () => {
    const installed = emptyCatalog();
    installed.tables.push({ tableOid: "10", schemaName: "hall", tableName: "contact" });
    installed.columns.push({
      tableOid: "10",
      schemaName: "hall",
      tableName: "contact",
      columnNumber: 1,
      columnName: "reference",
      dataType: "text",
      notNull: false,
      identityKind: "",
      generatedKind: "",
    });
    const target = structuredClone(installed);
    target.columns[0] = { ...target.columns[0]!, dataType: "uuid" };

    expect(() => planHallSchemaUpgrade(installed, target)).toThrow(
      "without an explicit data-preserving migration rule",
    );
  });

  it("refuses to infer destructive table, column or type removals", () => {
    const installed = emptyCatalog();
    installed.tables.push({ tableOid: "10", schemaName: "hall", tableName: "contact" });
    installed.columns.push({
      tableOid: "10",
      schemaName: "hall",
      tableName: "contact",
      columnNumber: 1,
      columnName: "name",
      dataType: "text",
      notNull: false,
      identityKind: "",
      generatedKind: "",
    });
    const target = emptyCatalog();

    expect(() => planHallSchemaUpgrade(installed, target)).toThrow(HallSchemaUpgradePlanningError);
  });
});
