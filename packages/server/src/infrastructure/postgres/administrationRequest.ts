import { randomUUID } from "node:crypto";
import { HallPostgresError, type PostgresRequest } from "@hall/postgres";
import { PersistenceError } from "../../repositories/errors.js";
import type { RequestContextStore } from "../../security/requestContext.js";

/**
 * The database role and call context of the current request. An HTTP request without account calls anonymously;
 * server code outside any request, such as startup, calls as an authenticated identity without actor.
 */
export function administrationRequest(requestContext: RequestContextStore): PostgresRequest {
  const context = requestContext.current();
  const principal = context?.principal;
  return {
    role: principal || !context ? "hall_api_authenticated" : "hall_api_anonymous",
    context: {
      requestId: context?.requestId ?? randomUUID(),
      actorId: principal?.id ?? null,
      contactId: principal?.contactId ?? null,
      roles: principal?.roles ?? [],
    },
  };
}

/** An integrity or serialization conflict of PostgreSQL is answered as a persistence conflict. */
export function translatePersistenceError(error: unknown): unknown {
  if (
    error instanceof HallPostgresError &&
    (error.sqlState.startsWith("23") || error.sqlState === "40001" || error.sqlState === "40P01")
  ) {
    return new PersistenceError("conflict", { cause: error, constraint: error.constraint ?? undefined });
  }
  return error;
}

export async function administrationCall<Result>(operation: () => Promise<Result>): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    throw translatePersistenceError(error);
  }
}
