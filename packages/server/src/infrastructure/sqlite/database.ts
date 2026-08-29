import { randomUUID } from "node:crypto";
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
  if (config.database.kind !== "sqlite") throw new Error("SQLite configuration required");
  const databasePath = config.database.path;
  const secureDatabaseFiles = () => {
    if (databasePath === ":memory:") return;
    for (const suffix of ["", "-wal", "-shm"]) {
      const path = `${databasePath}${suffix}`;
      if (existsSync(path)) chmodSync(path, 0o600);
    }
  };
  if (databasePath !== ":memory:") {
    const databaseDirectory = dirname(databasePath);
    mkdirSync(databaseDirectory, { recursive: true, mode: 0o700 });
    chmodSync(databaseDirectory, 0o700);
  }
  const database = new DatabaseSync(databasePath);
  try {
    secureDatabaseFiles();
    initializeSchema(database);
    secureDatabaseFiles();
    return new SqliteExecutor(database, requestContext, databasePath === ":memory:" ? randomUUID() : databasePath);
  } catch (error) {
    try {
      database.close();
    } catch (closeError) {
      throw new AggregateError([error, closeError], "SQLite initialization and cleanup failed");
    }
    throw error;
  }
}
