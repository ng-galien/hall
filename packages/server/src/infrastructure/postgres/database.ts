import type { ServerConfig } from "../../core/config.js";
import type { RequestContextStore } from "../../security/requestContext.js";
import { PostgresExecutor } from "./executor.js";

export function createPostgresExecutor({
  config,
  requestContext,
}: {
  config: ServerConfig;
  requestContext: RequestContextStore;
}): PostgresExecutor {
  if (config.database.kind !== "postgres") throw new Error("PostgreSQL configuration required");
  return new PostgresExecutor(config.database.url, requestContext);
}
