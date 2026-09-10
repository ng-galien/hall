import { matchDiscriminated } from "@hall/domain";
import type { Pool } from "pg";
import type { ServerConfig } from "../../core/config.js";
import type { RequestContextStore } from "../../security/requestContext.js";
import { createPostgresExecutor } from "../postgres/database.js";
import { createSqliteExecutor } from "../sqlite/database.js";
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
  return matchDiscriminated(config.database, "kind", {
    postgres: () => createPostgresExecutor({ config, requestContext, postgresPool }),
    sqlite: () => createSqliteExecutor({ config, requestContext }),
  });
}
