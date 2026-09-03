import type { Pool } from "pg";
import { PostgresSchemaBootstrap } from "./bootstrap.js";
import { type HallPostgresConfig, parseHallPostgresConfig } from "./config.js";
import { PostgresCouncil } from "./council.js";
import { createPostgresPool } from "./pool.js";
import { PostgresResources } from "./resources.js";

export class PostgresClient {
  readonly bootstrap: PostgresSchemaBootstrap;
  readonly council: PostgresCouncil;
  readonly resources: PostgresResources;

  constructor(private readonly pool: Pool) {
    this.bootstrap = new PostgresSchemaBootstrap(pool);
    this.council = new PostgresCouncil(pool);
    this.resources = new PostgresResources(pool);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function createPostgresClient(input: HallPostgresConfig): PostgresClient {
  const config = parseHallPostgresConfig(input);
  const pool = createPostgresPool({ connectionString: config.connectionString, max: config.maxConnections });
  return new PostgresClient(pool);
}
