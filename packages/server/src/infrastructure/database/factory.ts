import type { Pool } from "pg";
import type { ServerConfig } from "../../core/config.js";
import type { RequestContextStore } from "../../security/requestContext.js";
import { createPostgresExecutor } from "../postgres/database.js";
import type { SqlExecutor } from "./executor.js";

export function createSqlExecutor({
  config,
  requestContext,
  postgresPool,
}: {
  config: ServerConfig;
  requestContext: RequestContextStore;
  postgresPool?: Pool | null;
}): SqlExecutor {
  return createPostgresExecutor({ config, requestContext, postgresPool });
}
