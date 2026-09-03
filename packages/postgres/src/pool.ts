import { Pool, type PoolConfig } from "pg";

export type HallPostgresPoolConfig = Readonly<{
  connectionString: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}>;

export function createPostgresPool(config: HallPostgresPoolConfig): Pool {
  const poolConfig: PoolConfig = {
    connectionString: config.connectionString,
    max: config.max ?? 10,
    idleTimeoutMillis: config.idleTimeoutMillis ?? 30_000,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 5_000,
  };
  return new Pool(poolConfig);
}
