import type { Pool } from "pg";
import { logger } from "../../core/logger.js";

/** Logs the failure of an idle pooled connection instead of crashing the process; pg discards that connection. */
export function logIdleConnectionFailures(pool: Pool): Pool {
  pool.on("error", (error) => logger.error({ error }, "PostgreSQL idle connection failed"));
  return pool;
}
