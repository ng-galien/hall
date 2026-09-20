import type { Pool } from "pg";
import { PostgresSchemaBootstrap, type PostgresSchemaUpgradeMode } from "./bootstrap.js";
import { type HallPostgresConfig, parseHallPostgresConfig } from "./config.js";
import { PostgresCouncil } from "./council.js";
import { PostgresCouncilDecisions } from "./councilDecisions.js";
import { PostgresDirectory } from "./directory.js";
import { PostgresMinutes } from "./minutes.js";
import { createPostgresPool } from "./pool.js";
import { PostgresResources } from "./resources.js";

export class PostgresClient {
  readonly bootstrap: PostgresSchemaBootstrap;
  readonly council: PostgresCouncil;
  readonly directory: PostgresDirectory;
  readonly resources: PostgresResources;
  readonly minutes: PostgresMinutes;
  readonly councilDecisions: PostgresCouncilDecisions;

  constructor(
    private readonly pool: Pool,
    private readonly ownsPool = true,
    schemaUpgradeMode: PostgresSchemaUpgradeMode = "automatic",
  ) {
    this.bootstrap = new PostgresSchemaBootstrap(pool, undefined, schemaUpgradeMode);
    this.council = new PostgresCouncil(pool);
    this.directory = new PostgresDirectory(pool);
    this.resources = new PostgresResources(pool);
    this.minutes = new PostgresMinutes(pool);
    this.councilDecisions = new PostgresCouncilDecisions(pool);
  }

  async close(): Promise<void> {
    if (this.ownsPool) await this.pool.end();
  }
}

export function createPostgresClient(input: HallPostgresConfig): PostgresClient {
  const config = parseHallPostgresConfig(input);
  const pool = createPostgresPool({ connectionString: config.connectionString, max: config.maxConnections });
  return new PostgresClient(pool);
}
