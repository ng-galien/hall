import { PersistenceError } from "../../repositories/errors.js";

export function translatePersistenceError(error: unknown): unknown {
  if (error instanceof PersistenceError) return error;
  if (error instanceof Error) {
    if (
      "code" in error &&
      typeof error.code === "string" &&
      (error.code.startsWith("23") || error.code === "40001" || error.code === "40P01")
    ) {
      const constraint = "constraint" in error && typeof error.constraint === "string" ? error.constraint : undefined;
      return new PersistenceError("conflict", { cause: error, constraint });
    }
  }
  return error;
}
