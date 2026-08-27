import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ServerConfig } from "../../core/config.js";
import { SqliteExecutor } from "./executor.js";
import { initializeSchema } from "./schema.js";

export function createSqliteExecutor({ config }: { config: ServerConfig }): SqliteExecutor {
  if (config.databasePath !== ":memory:") mkdirSync(dirname(config.databasePath), { recursive: true });
  const database = new DatabaseSync(config.databasePath);
  try {
    initializeSchema(database);
    return new SqliteExecutor(database);
  } catch (error) {
    try {
      database.close();
    } catch {
      // The database may already be closed after an initialization failure.
    }
    throw error;
  }
}
