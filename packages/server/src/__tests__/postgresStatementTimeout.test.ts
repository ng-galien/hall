import { PostgresSchemaBootstrap, StatementTimeoutError } from "@hall/postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresExecutor } from "../infrastructure/postgres/executor.js";
import { RequestContextStore } from "../security/requestContext.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required; use test:postgres");

// @verifies-requirement HALL-TR-DST-040
describe("server-owned PostgreSQL statements", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1, options: "-c search_path=public" });
  const locker = new Pool({ connectionString: databaseUrl, max: 1, options: "-c search_path=public" });
  let executor: PostgresExecutor;

  beforeAll(async () => {
    await new PostgresSchemaBootstrap(pool).install();
    executor = new PostgresExecutor(databaseUrl, new RequestContextStore(), pool, "automatic", 300);
    await executor.ready();
  });

  afterAll(async () => {
    await executor.close();
    await pool.end();
    await locker.end();
  });

  async function whileUsersLocked<Result>(operation: () => Promise<Result>): Promise<Result> {
    const client = await locker.connect();
    try {
      await client.query("BEGIN");
      await client.query("LOCK TABLE users IN ACCESS EXCLUSIVE MODE");
      return await operation();
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  }

  it("stops a single statement and a transaction that exceed the interactive timeout", async () => {
    const single = await whileUsersLocked(() =>
      executor.get("security.actorExists", { actorUserId: "nobody" }).catch((error: unknown) => error),
    );
    expect(single).toBeInstanceOf(StatementTimeoutError);
    expect(single).toMatchObject({ sqlState: "57014", budget: "interactive", timeoutMs: 300 });

    const transaction = await whileUsersLocked(() =>
      executor
        .execute(() => executor.get("security.actorExists", { actorUserId: "nobody" }))
        .catch((error: unknown) => error),
    );
    expect(transaction).toBeInstanceOf(StatementTimeoutError);
  });

  it("lets a short statement pass and leaves no timeout on the pooled connection", async () => {
    await expect(executor.get("security.actorExists", { actorUserId: "nobody" })).resolves.toBeUndefined();
    const after = await pool.query<{ timeout: string }>("SELECT current_setting('statement_timeout') AS timeout");
    expect(after.rows[0].timeout).toBe("0");
  });
});
