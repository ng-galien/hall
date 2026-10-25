import type { Pool } from "pg";
import type { ServerConfig } from "../../core/config.js";
import type { RequestContextStore } from "../../security/requestContext.js";
import { PostgresExecutor } from "./executor.js";

export function createPostgresExecutor({
  config,
  requestContext,
  postgresPool,
  schemaUpgradeMode,
}: {
  config: ServerConfig;
  requestContext: RequestContextStore;
  postgresPool?: Pool | null;
  schemaUpgradeMode?: "automatic" | "verify-only";
}): PostgresExecutor {
  return new PostgresExecutor(config.database.url, requestContext, postgresPool ?? undefined, schemaUpgradeMode);
}
