import { matchDiscriminated } from "@hall/domain";
import type { ServerConfig } from "../../core/config.js";
import type { RequestContextStore } from "../../security/requestContext.js";
import { createPostgresExecutor } from "../postgres/database.js";
import { createSqliteExecutor } from "../sqlite/database.js";
import type { SqlExecutor } from "./executor.js";

export function createSqlExecutor({
  config,
  requestContext,
}: {
  config: ServerConfig;
  requestContext: RequestContextStore;
}): SqlExecutor {
  return matchDiscriminated(config.database, "kind", {
    postgres: () => createPostgresExecutor({ config, requestContext }),
    sqlite: () => createSqliteExecutor({ config, requestContext }),
  });
}
