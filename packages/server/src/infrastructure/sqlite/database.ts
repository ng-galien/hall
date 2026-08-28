import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ServerConfig } from "../../core/config.js";
import type { RequestContextStore } from "../../security/requestContext.js";
import { SqliteExecutor } from "./executor.js";
import { initializeSchema } from "./schema.js";

export function createSqliteExecutor({
  config,
  requestContext,
}: {
  config: ServerConfig;
  requestContext: RequestContextStore;
}): SqliteExecutor {
  const secureDatabaseFiles = () => {
    if (config.databasePath === ":memory:") return;
    for (const suffix of ["", "-wal", "-shm"]) {
      const path = `${config.databasePath}${suffix}`;
      if (existsSync(path)) chmodSync(path, 0o600);
    }
  };
  if (config.databasePath !== ":memory:") {
    const databaseDirectory = dirname(config.databasePath);
    mkdirSync(databaseDirectory, { recursive: true, mode: 0o700 });
    chmodSync(databaseDirectory, 0o700);
  }
  const database = new DatabaseSync(config.databasePath);
  try {
    secureDatabaseFiles();
    initializeSchema(database);
    secureDatabaseFiles();
    return new SqliteExecutor(database, requestContext);
  } catch (error) {
    try {
      database.close();
    } catch {
      // The database may already be closed after an initialization failure.
    }
    throw error;
  }
}
