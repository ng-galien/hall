import { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { logger } from "../core/logger.js";
import { logIdleConnectionFailures } from "../infrastructure/postgres/idleConnectionFailures.js";
import { createPostgresTestPool } from "./support/postgresTestDatabase.js";

it("keeps serving queries after PostgreSQL terminates an idle pooled connection", async () => {
  const { databaseUrl, pool: administration } = createPostgresTestPool();
  const pool = logIdleConnectionFailures(new Pool({ connectionString: databaseUrl, max: 1 }));
  const logged = vi.spyOn(logger, "error");
  try {
    const { pid } = (await pool.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0];
    const failure = new Promise<void>((resolve) => pool.once("error", () => resolve()));
    await administration.query("SELECT pg_terminate_backend($1)", [pid]);
    await failure;
    expect(logged).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      "PostgreSQL idle connection failed",
    );
    expect((await pool.query<{ value: number }>("SELECT 1 AS value")).rows).toEqual([{ value: 1 }]);
  } finally {
    logged.mockRestore();
    await pool.end();
    await administration.end();
  }
});
