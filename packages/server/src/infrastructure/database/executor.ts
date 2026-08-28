import type { UnitOfWork } from "../../repositories/contracts.js";
import type { DatabaseRow } from "../../repositories/row.js";
import { queryText, type SqlDialect, type SqlQueryName } from "./queries.js";

export type SqlValue = string | number | boolean | Buffer | null;
export type SqlParameters = Record<string, SqlValue | undefined>;

export interface SqlRunResult {
  changes: number;
}

export interface SqlExecutor extends UnitOfWork {
  readonly dialect: SqlDialect;
  all<Row extends DatabaseRow = DatabaseRow>(name: SqlQueryName, parameters?: SqlParameters): Promise<Row[]>;
  get<Row extends DatabaseRow = DatabaseRow>(name: SqlQueryName, parameters?: SqlParameters): Promise<Row | undefined>;
  run(name: SqlQueryName, parameters?: SqlParameters): Promise<SqlRunResult>;
  ready(): Promise<void>;
  close(): Promise<void>;
}

export interface CompiledQuery {
  text: string;
  values: SqlValue[];
}

export function compileQuery(name: SqlQueryName, dialect: SqlDialect, parameters: SqlParameters = {}): CompiledQuery {
  const values: SqlValue[] = [];
  const text = queryText(name, dialect).replace(/(?<!:):([A-Za-z_][A-Za-z0-9_]*)/g, (_match, key: string) => {
    if (!(key in parameters)) throw new Error(`Missing SQL parameter :${key} for query ${name}`);
    values.push(parameters[key] ?? null);
    return dialect === "postgres" ? `$${values.length}` : "?";
  });
  return { text, values };
}
