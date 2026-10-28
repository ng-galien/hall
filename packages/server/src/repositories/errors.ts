import { HallPostgresError } from "@hall/postgres";

export type PersistenceErrorCode = "conflict";

export class PersistenceError extends Error {
  readonly constraint?: string;

  constructor(
    readonly code: PersistenceErrorCode,
    options?: ErrorOptions & { constraint?: string },
  ) {
    super(code, options);
    this.name = "PersistenceError";
    this.constraint = options?.constraint;
  }
}

/** The Hall SQL state carried by an error or one of its causes, or null when PostgreSQL raised none. */
export function hallSqlState(error: unknown): string | null {
  for (let current = error; current instanceof Error; current = current.cause) {
    if (current instanceof HallPostgresError) return current.sqlState;
  }
  return null;
}
