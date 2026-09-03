import type { DatabaseError } from "pg";

type DatabaseErrorDetails = Readonly<{
  sqlState: string;
  constraint: string | null;
  table: string | null;
  column: string | null;
  detail: string | null;
  schema: string | null;
}>;

export class HallPostgresError extends Error implements DatabaseErrorDetails {
  readonly code: string;
  readonly sqlState: string;
  readonly constraint: string | null;
  readonly table: string | null;
  readonly column: string | null;
  readonly detail: string | null;
  readonly schema: string | null;

  constructor(message: string, details: DatabaseErrorDetails, cause: unknown) {
    super(message, { cause });
    this.name = "HallPostgresError";
    this.code = details.sqlState;
    this.sqlState = details.sqlState;
    this.constraint = details.constraint;
    this.table = details.table;
    this.column = details.column;
    this.detail = details.detail;
    this.schema = details.schema;
  }
}

export class ProjectionValidationError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "ProjectionValidationError";
  }
}

export class SchemaContractError extends Error {
  readonly expectedFingerprint: string;
  readonly actualFingerprint: string | null;

  constructor(message: string, expectedFingerprint: string, actualFingerprint: string | null = null) {
    super(message);
    this.name = "SchemaContractError";
    this.expectedFingerprint = expectedFingerprint;
    this.actualFingerprint = actualFingerprint;
  }
}

type PgErrorLike = Error &
  Partial<Pick<DatabaseError, "code" | "constraint" | "table" | "column" | "detail" | "schema">>;

export function postgresSqlState(error: unknown): string | null {
  if (!(error instanceof Error) || !("code" in error) || typeof (error as PgErrorLike).code !== "string") return null;
  return (error as PgErrorLike).code ?? null;
}

export function preservePostgresError(error: unknown): Error {
  if (
    error instanceof ProjectionValidationError ||
    error instanceof SchemaContractError ||
    error instanceof HallPostgresError
  ) {
    return error;
  }

  const sqlState = postgresSqlState(error);
  if (!sqlState || !(error instanceof Error)) return error instanceof Error ? error : new Error(String(error));

  const pgError = error as PgErrorLike;
  return new HallPostgresError(
    error.message,
    {
      sqlState,
      constraint: pgError.constraint ?? null,
      table: pgError.table ?? null,
      column: pgError.column ?? null,
      detail: pgError.detail ?? null,
      schema: pgError.schema ?? null,
    },
    error,
  );
}
