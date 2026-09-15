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
