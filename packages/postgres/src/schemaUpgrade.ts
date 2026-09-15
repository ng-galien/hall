import type {
  PostgresCatalogColumn,
  PostgresCatalogConstraint,
  PostgresCatalogDefinition,
  PostgresCatalogModel,
  PostgresCatalogTable,
} from "@ng-galien/postgresql-catalog";

const HALL_SCHEMAS = new Set(["hall", "hall_api", "hall_meta"]);
const RENAMED_FROM = /(?:^|\s)@hall\s+renamed-from\s+([A-Za-z_][A-Za-z0-9_]*)(?=\s|$)/;

export type HallSchemaUpgradeStatementKind =
  | "drop-trigger"
  | "drop-view"
  | "drop-constraint"
  | "drop-index"
  | "drop-routine"
  | "create-schema"
  | "create-type"
  | "alter-type"
  | "create-table"
  | "rename-column"
  | "add-column"
  | "alter-column"
  | "create-routine"
  | "create-view"
  | "create-constraint"
  | "create-index"
  | "create-trigger"
  | "comment-column";

export interface HallSchemaUpgradeStatement {
  kind: HallSchemaUpgradeStatementKind;
  identity: string;
  sql: string;
}

export interface HallSchemaUpgradePlan {
  statements: HallSchemaUpgradeStatement[];
}

export class HallSchemaUpgradePlanningError extends Error {
  constructor(
    message: string,
    readonly identities: readonly string[],
  ) {
    super(message);
    this.name = "HallSchemaUpgradePlanningError";
  }
}

export function planHallSchemaUpgrade(
  installedInput: PostgresCatalogModel,
  targetInput: PostgresCatalogModel,
): HallSchemaUpgradePlan {
  const installed = hallCatalog(installedInput);
  const target = hallCatalog(targetInput);
  const statements: HallSchemaUpgradeStatement[] = [];
  const installedTables = tableMap(installed.tables);
  const targetTables = tableMap(target.tables);
  const forbidden = findForbiddenRemovals(installed, target, installedTables, targetTables);
  if (forbidden.length > 0) {
    throw new HallSchemaUpgradePlanningError(
      "Hall refuses to remove tables, columns or custom types without an explicit migration rule",
      forbidden,
    );
  }

  const targetColumnRenames = columnRenames(installed, target, installedTables, targetTables);
  const installedConstraints = constraintMap(installed, installedTables);
  const targetConstraints = constraintMap(target, targetTables);

  appendDefinitionDrops(statements, installed.triggers, target.triggers, "drop-trigger", dropTrigger);
  appendViewDrops(statements, installed, target);
  appendConstraintDrops(statements, installedConstraints, targetConstraints);
  appendDefinitionDrops(statements, installed.indexes, target.indexes, "drop-index", dropIndex);
  appendMissingDefinitionDrops(statements, installed.routines, target.routines, "drop-routine", dropRoutine);

  for (const schema of target.schemas) {
    if (!installed.schemas.some((candidate) => candidate.schemaName === schema.schemaName)) {
      append(statements, "create-schema", schema.schemaName, `CREATE SCHEMA ${identifier(schema.schemaName)}`);
    }
  }
  appendTypes(statements, installed.types, target.types);
  appendTables(statements, target, installedTables, targetTables);
  appendColumnRenames(statements, targetColumnRenames);
  appendColumns(statements, installed, target, installedTables, targetTables, targetColumnRenames);
  appendDefinitionCreates(statements, installed.routines, target.routines, "create-routine", routineSql);
  appendViewCreates(statements, installed, target);
  appendConstraintCreates(statements, installedConstraints, targetConstraints);
  appendDefinitionCreates(statements, installed.indexes, target.indexes, "create-index", definitionSql);
  appendDefinitionCreates(statements, installed.triggers, target.triggers, "create-trigger", definitionSql);
  appendColumnComments(statements, installed, target, targetColumnRenames);

  return { statements };
}

function hallCatalog(catalog: PostgresCatalogModel): PostgresCatalogModel {
  const schemas = catalog.schemas.filter((schema) => HALL_SCHEMAS.has(schema.schemaName));
  const tables = catalog.tables.filter((table) => HALL_SCHEMAS.has(table.schemaName));
  const tableOids = new Set(tables.map((table) => table.tableOid));
  return {
    schemas,
    types: catalog.types.filter((definition) => HALL_SCHEMAS.has(definition.schemaName)),
    tables,
    columns: catalog.columns.filter((column) => tableOids.has(column.tableOid)),
    constraints: catalog.constraints.filter((constraint) => tableOids.has(constraint.tableOid)),
    indexes: catalog.indexes.filter((definition) => HALL_SCHEMAS.has(definition.schemaName)),
    views: catalog.views.filter((definition) => HALL_SCHEMAS.has(definition.schemaName)),
    routines: catalog.routines.filter((definition) => HALL_SCHEMAS.has(definition.schemaName)),
    triggers: catalog.triggers.filter((definition) => HALL_SCHEMAS.has(definition.schemaName)),
    viewDependencies: catalog.viewDependencies.filter((dependency) => tableOids.has(dependency.targetRelationOid)),
  };
}

function findForbiddenRemovals(
  installed: PostgresCatalogModel,
  target: PostgresCatalogModel,
  installedTables: ReadonlyMap<string, PostgresCatalogTable>,
  targetTables: ReadonlyMap<string, PostgresCatalogTable>,
): string[] {
  const forbidden: string[] = [];
  for (const identity of installedTables.keys()) {
    if (!targetTables.has(identity)) forbidden.push(`table:${identity}`);
  }
  const targetTypes = definitionMap(target.types);
  for (const [identity] of definitionMap(installed.types)) {
    if (!targetTypes.has(identity)) forbidden.push(`type:${identity}`);
  }
  const renames = columnRenames(installed, target, installedTables, targetTables);
  const renamedOldColumns = new Set([...renames.values()].map((rename) => rename.installedIdentity));
  const targetColumns = columnMap(target.columns);
  for (const [identity] of columnMap(installed.columns)) {
    if (!targetColumns.has(identity) && !renamedOldColumns.has(identity)) forbidden.push(`column:${identity}`);
  }
  return forbidden.sort();
}

interface ColumnRename {
  installedIdentity: string;
  targetIdentity: string;
  schemaName: string;
  tableName: string;
  oldName: string;
  newName: string;
}

function columnRenames(
  installed: PostgresCatalogModel,
  target: PostgresCatalogModel,
  installedTables: ReadonlyMap<string, PostgresCatalogTable>,
  targetTables: ReadonlyMap<string, PostgresCatalogTable>,
): Map<string, ColumnRename> {
  const installedColumns = columnMap(installed.columns);
  const renames = new Map<string, ColumnRename>();
  for (const targetColumn of target.columns) {
    const match = targetColumn.comment?.match(RENAMED_FROM);
    if (!match) continue;
    const targetTable = target.tables.find((table) => table.tableOid === targetColumn.tableOid);
    if (!targetTable) continue;
    const oldIdentity = `${targetTable.schemaName}.${targetTable.tableName}.${match[1]}`;
    const newIdentity = columnIdentity(targetColumn);
    if (installedColumns.has(newIdentity) || !installedColumns.has(oldIdentity)) continue;
    const installedTable = installedTables.get(`${targetTable.schemaName}.${targetTable.tableName}`);
    if (!installedTable || !targetTables.has(`${targetTable.schemaName}.${targetTable.tableName}`)) continue;
    renames.set(newIdentity, {
      installedIdentity: oldIdentity,
      targetIdentity: newIdentity,
      schemaName: targetTable.schemaName,
      tableName: targetTable.tableName,
      oldName: match[1]!,
      newName: targetColumn.columnName,
    });
  }
  return renames;
}

function appendDefinitionDrops(
  statements: HallSchemaUpgradeStatement[],
  installed: readonly PostgresCatalogDefinition[],
  target: readonly PostgresCatalogDefinition[],
  kind: Extract<HallSchemaUpgradeStatementKind, `drop-${string}`>,
  render: (definition: PostgresCatalogDefinition) => string,
): void {
  const targetByIdentity = definitionMap(target);
  for (const [identity, definition] of definitionMap(installed)) {
    const desired = targetByIdentity.get(identity);
    if (!desired || normalized(desired.definition) !== normalized(definition.definition)) {
      append(statements, kind, identity, render(definition));
    }
  }
}

function appendMissingDefinitionDrops(
  statements: HallSchemaUpgradeStatement[],
  installed: readonly PostgresCatalogDefinition[],
  target: readonly PostgresCatalogDefinition[],
  kind: Extract<HallSchemaUpgradeStatementKind, `drop-${string}`>,
  render: (definition: PostgresCatalogDefinition) => string,
): void {
  const targetByIdentity = definitionMap(target);
  for (const [identity, definition] of definitionMap(installed)) {
    if (!targetByIdentity.has(identity)) append(statements, kind, identity, render(definition));
  }
}

function appendDefinitionCreates(
  statements: HallSchemaUpgradeStatement[],
  installed: readonly PostgresCatalogDefinition[],
  target: readonly PostgresCatalogDefinition[],
  kind: Extract<HallSchemaUpgradeStatementKind, `create-${string}`>,
  render: (definition: PostgresCatalogDefinition) => string,
): void {
  const installedByIdentity = definitionMap(installed);
  for (const [identity, definition] of definitionMap(target)) {
    const actual = installedByIdentity.get(identity);
    if (!actual || normalized(actual.definition) !== normalized(definition.definition)) {
      append(statements, kind, identity, render(definition));
    }
  }
}

function appendViewDrops(
  statements: HallSchemaUpgradeStatement[],
  installed: PostgresCatalogModel,
  target: PostgresCatalogModel,
): void {
  const targetByIdentity = definitionMap(target.views);
  for (const view of [...installed.views].reverse()) {
    const identity = definitionIdentity(view);
    const desired = targetByIdentity.get(identity);
    if (!desired || normalized(desired.definition) !== normalized(view.definition)) {
      append(statements, "drop-view", identity, `DROP VIEW ${qualified(view.schemaName, view.objectName)}`);
    }
  }
}

function appendViewCreates(
  statements: HallSchemaUpgradeStatement[],
  installed: PostgresCatalogModel,
  target: PostgresCatalogModel,
): void {
  const installedByIdentity = definitionMap(installed.views);
  for (const view of target.views) {
    const identity = definitionIdentity(view);
    const actual = installedByIdentity.get(identity);
    if (!actual || normalized(actual.definition) !== normalized(view.definition)) {
      append(
        statements,
        "create-view",
        identity,
        `CREATE VIEW ${qualified(view.schemaName, view.objectName)} AS ${withoutTerminator(view.definition)}`,
      );
    }
  }
}

function appendConstraintDrops(
  statements: HallSchemaUpgradeStatement[],
  installed: ReadonlyMap<string, ConstraintWithTable>,
  target: ReadonlyMap<string, ConstraintWithTable>,
): void {
  for (const [identity, actual] of installed) {
    const desired = target.get(identity);
    if (!desired || normalized(desired.constraint.definition) !== normalized(actual.constraint.definition)) {
      append(
        statements,
        "drop-constraint",
        identity,
        `ALTER TABLE ${qualified(actual.table.schemaName, actual.table.tableName)} DROP CONSTRAINT ${identifier(actual.constraint.constraintName)}`,
      );
    }
  }
}

function appendConstraintCreates(
  statements: HallSchemaUpgradeStatement[],
  installed: ReadonlyMap<string, ConstraintWithTable>,
  target: ReadonlyMap<string, ConstraintWithTable>,
): void {
  for (const [identity, desired] of target) {
    const actual = installed.get(identity);
    if (!actual || normalized(desired.constraint.definition) !== normalized(actual.constraint.definition)) {
      append(
        statements,
        "create-constraint",
        identity,
        `ALTER TABLE ${qualified(desired.table.schemaName, desired.table.tableName)} ADD CONSTRAINT ${identifier(desired.constraint.constraintName)} ${withoutTerminator(desired.constraint.definition)}`,
      );
    }
  }
}

function appendTypes(
  statements: HallSchemaUpgradeStatement[],
  installed: readonly PostgresCatalogDefinition[],
  target: readonly PostgresCatalogDefinition[],
): void {
  const installedByIdentity = definitionMap(installed);
  for (const [identity, desired] of definitionMap(target)) {
    const actual = installedByIdentity.get(identity);
    if (!actual) {
      append(statements, "create-type", identity, desired.definition);
      continue;
    }
    if (normalized(actual.definition) === normalized(desired.definition)) continue;
    const actualValues = enumValues(actual.definition);
    const desiredValues = enumValues(desired.definition);
    if (!isOrderedSubset(actualValues, desiredValues)) {
      throw new HallSchemaUpgradePlanningError(
        `Hall cannot remove, reorder or rename values of enum ${identity} automatically`,
        [`type:${identity}`],
      );
    }
    let previous: string | undefined;
    for (const value of desiredValues) {
      if (!actualValues.includes(value)) {
        const nextExisting = desiredValues
          .slice(desiredValues.indexOf(value) + 1)
          .find((candidate) => actualValues.includes(candidate));
        const position = nextExisting
          ? ` BEFORE ${literal(nextExisting)}`
          : previous
            ? ` AFTER ${literal(previous)}`
            : "";
        append(
          statements,
          "alter-type",
          `${identity}.${value}`,
          `ALTER TYPE ${qualified(desired.schemaName, desired.objectName)} ADD VALUE IF NOT EXISTS ${literal(value)}${position}`,
        );
      }
      previous = value;
    }
  }
}

function appendTables(
  statements: HallSchemaUpgradeStatement[],
  target: PostgresCatalogModel,
  installedTables: ReadonlyMap<string, PostgresCatalogTable>,
  targetTables: ReadonlyMap<string, PostgresCatalogTable>,
): void {
  for (const [identity, table] of targetTables) {
    if (installedTables.has(identity)) continue;
    const columns = target.columns
      .filter((column) => column.tableOid === table.tableOid)
      .sort((left, right) => left.columnNumber - right.columnNumber)
      .map(renderColumn);
    append(
      statements,
      "create-table",
      identity,
      `CREATE TABLE ${qualified(table.schemaName, table.tableName)} (\n  ${columns.join(",\n  ")}\n)`,
    );
  }
}

function appendColumnRenames(
  statements: HallSchemaUpgradeStatement[],
  renames: ReadonlyMap<string, ColumnRename>,
): void {
  for (const rename of renames.values()) {
    append(
      statements,
      "rename-column",
      rename.targetIdentity,
      `ALTER TABLE ${qualified(rename.schemaName, rename.tableName)} RENAME COLUMN ${identifier(rename.oldName)} TO ${identifier(rename.newName)}`,
    );
  }
}

function appendColumns(
  statements: HallSchemaUpgradeStatement[],
  installed: PostgresCatalogModel,
  target: PostgresCatalogModel,
  installedTables: ReadonlyMap<string, PostgresCatalogTable>,
  targetTables: ReadonlyMap<string, PostgresCatalogTable>,
  renames: ReadonlyMap<string, ColumnRename>,
): void {
  const installedColumns = columnMap(installed.columns);
  for (const desired of target.columns) {
    const identity = columnIdentity(desired);
    const targetTable = targetTables.get(`${desired.schemaName}.${desired.tableName}`);
    if (!targetTable || !installedTables.has(`${desired.schemaName}.${desired.tableName}`)) continue;
    const rename = renames.get(identity);
    const actual = installedColumns.get(rename?.installedIdentity ?? identity);
    if (!actual) {
      append(
        statements,
        "add-column",
        identity,
        `ALTER TABLE ${qualified(desired.schemaName, desired.tableName)} ADD COLUMN ${renderColumn(desired)}`,
      );
      continue;
    }
    appendColumnAlterations(statements, actual, desired);
  }
}

function appendColumnAlterations(
  statements: HallSchemaUpgradeStatement[],
  actual: PostgresCatalogColumn,
  desired: PostgresCatalogColumn,
): void {
  const table = qualified(desired.schemaName, desired.tableName);
  const column = identifier(desired.columnName);
  const identity = columnIdentity(desired);
  if (actual.identityKind !== desired.identityKind || actual.generatedKind !== desired.generatedKind) {
    throw new HallSchemaUpgradePlanningError(
      `Hall cannot automatically change the identity or generated mode of ${identity}`,
      [`column:${identity}`],
    );
  }
  if (normalized(actual.dataType) !== normalized(desired.dataType)) {
    append(
      statements,
      "alter-column",
      identity,
      `ALTER TABLE ${table} ALTER COLUMN ${column} TYPE ${desired.dataType} USING ${column}::${desired.dataType}`,
    );
  }
  if (normalized(actual.defaultExpression ?? "") !== normalized(desired.defaultExpression ?? "")) {
    append(
      statements,
      "alter-column",
      identity,
      desired.defaultExpression
        ? `ALTER TABLE ${table} ALTER COLUMN ${column} SET DEFAULT ${desired.defaultExpression}`
        : `ALTER TABLE ${table} ALTER COLUMN ${column} DROP DEFAULT`,
    );
  }
  if (actual.notNull !== desired.notNull) {
    append(
      statements,
      "alter-column",
      identity,
      `ALTER TABLE ${table} ALTER COLUMN ${column} ${desired.notNull ? "SET" : "DROP"} NOT NULL`,
    );
  }
}

function appendColumnComments(
  statements: HallSchemaUpgradeStatement[],
  installed: PostgresCatalogModel,
  target: PostgresCatalogModel,
  renames: ReadonlyMap<string, ColumnRename>,
): void {
  const installedColumns = columnMap(installed.columns);
  for (const desired of target.columns) {
    const identity = columnIdentity(desired);
    const actual = installedColumns.get(renames.get(identity)?.installedIdentity ?? identity);
    if ((actual?.comment ?? null) === (desired.comment ?? null)) continue;
    append(
      statements,
      "comment-column",
      identity,
      `COMMENT ON COLUMN ${qualified(desired.schemaName, desired.tableName)}.${identifier(desired.columnName)} IS ${desired.comment === undefined ? "NULL" : literal(desired.comment)}`,
    );
  }
}

function dropTrigger(definition: PostgresCatalogDefinition): string {
  if (!definition.relationName) {
    throw new HallSchemaUpgradePlanningError("A trigger has no owning relation", [definitionIdentity(definition)]);
  }
  return `DROP TRIGGER ${identifier(definition.objectName)} ON ${qualified(definition.schemaName, definition.relationName)}`;
}

function dropIndex(definition: PostgresCatalogDefinition): string {
  return `DROP INDEX ${qualified(definition.schemaName, definition.objectName)}`;
}

function dropRoutine(definition: PostgresCatalogDefinition): string {
  const keyword = definition.routineKind === "procedure" ? "PROCEDURE" : "FUNCTION";
  return `DROP ${keyword} ${qualified(definition.schemaName, definition.objectName)}(${definition.identityArguments})`;
}

function routineSql(definition: PostgresCatalogDefinition): string {
  return definition.definition.replace(/^CREATE\s+(FUNCTION|PROCEDURE)\b/i, "CREATE OR REPLACE $1");
}

function definitionSql(definition: PostgresCatalogDefinition): string {
  return definition.definition;
}

function renderColumn(column: PostgresCatalogColumn): string {
  let sql = `${identifier(column.columnName)} ${column.dataType}`;
  if (column.identityKind === "a") sql += " GENERATED ALWAYS AS IDENTITY";
  else if (column.identityKind === "d") sql += " GENERATED BY DEFAULT AS IDENTITY";
  else if (column.generatedKind === "s" && column.defaultExpression) {
    sql += ` GENERATED ALWAYS AS (${column.defaultExpression}) STORED`;
  } else if (column.defaultExpression) sql += ` DEFAULT ${column.defaultExpression}`;
  if (column.notNull) sql += " NOT NULL";
  return sql;
}

interface ConstraintWithTable {
  constraint: PostgresCatalogConstraint;
  table: PostgresCatalogTable;
}

function constraintMap(
  catalog: PostgresCatalogModel,
  tables: ReadonlyMap<string, PostgresCatalogTable>,
): Map<string, ConstraintWithTable> {
  const byOid = new Map(catalog.tables.map((table) => [table.tableOid, table]));
  const result = new Map<string, ConstraintWithTable>();
  for (const constraint of catalog.constraints) {
    const table = byOid.get(constraint.tableOid);
    if (!table || !tables.has(`${table.schemaName}.${table.tableName}`)) continue;
    result.set(`${table.schemaName}.${table.tableName}.${constraint.constraintName}`, { constraint, table });
  }
  return result;
}

function tableMap(tables: readonly PostgresCatalogTable[]): Map<string, PostgresCatalogTable> {
  return new Map(tables.map((table) => [`${table.schemaName}.${table.tableName}`, table]));
}

function columnMap(columns: readonly PostgresCatalogColumn[]): Map<string, PostgresCatalogColumn> {
  return new Map(columns.map((column) => [columnIdentity(column), column]));
}

function columnIdentity(column: PostgresCatalogColumn): string {
  return `${column.schemaName}.${column.tableName}.${column.columnName}`;
}

function definitionMap(definitions: readonly PostgresCatalogDefinition[]): Map<string, PostgresCatalogDefinition> {
  return new Map(definitions.map((definition) => [definitionIdentity(definition), definition]));
}

function definitionIdentity(definition: PostgresCatalogDefinition): string {
  const signature = definition.routineKind ? `(${definition.identityArguments})` : "";
  const relation = definition.relationName ? `${definition.relationName}.` : "";
  return `${definition.schemaName}.${relation}${definition.objectName}${signature}`;
}

function append(
  statements: HallSchemaUpgradeStatement[],
  kind: HallSchemaUpgradeStatementKind,
  identity: string,
  sql: string,
): void {
  statements.push({ kind, identity, sql: `${withoutTerminator(sql)};` });
}

function qualified(schema: string, name: string): string {
  return `${identifier(schema)}.${identifier(name)}`;
}

function identifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function withoutTerminator(value: string): string {
  return value.trim().replace(/;+$/, "");
}

function enumValues(definition: string): string[] {
  const match = definition.match(/\bAS\s+ENUM\s*\((.*)\)\s*;?$/is);
  if (!match) {
    throw new HallSchemaUpgradePlanningError("Only PostgreSQL enum custom types can be upgraded automatically", [
      definition,
    ]);
  }
  const values: string[] = [];
  const pattern = /'((?:''|[^'])*)'/g;
  for (const value of match[1]!.matchAll(pattern)) values.push(value[1]!.replaceAll("''", "'"));
  return values;
}

function isOrderedSubset(actual: readonly string[], desired: readonly string[]): boolean {
  let position = -1;
  for (const value of actual) {
    position = desired.indexOf(value, position + 1);
    if (position < 0) return false;
  }
  return true;
}
