import { PersistenceError } from "../../repositories/errors.js";

export function translatePersistenceError(error: unknown): unknown {
  if (error instanceof PersistenceError) return error;
  if (error instanceof Error) {
    if ("errcode" in error && typeof error.errcode === "number" && (error.errcode & 0xff) === 19) {
      return new PersistenceError("conflict", { cause: error, constraint: sqliteConstraint(error.message) });
    }
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

function sqliteConstraint(message: string): string | undefined {
  if (message.includes("council_term_not_configured")) return "council_term_not_configured";
  if (message.includes("council_term_capacity_reached")) return "council_term_capacity_reached";
  if (message.includes("council_term_capacity_below_active_count")) {
    return "council_term_capacity_below_active_count";
  }
  if (message.includes("resources.folder_path, resources.title")) return "one_resource_title_per_folder";
  if (message.includes("council_business.folder_path, council_business.title")) {
    return "one_council_business_title_per_folder";
  }
  return undefined;
}
