import { PostgresClient, PostgresSchemaBootstrap, StatementTimeoutError } from "@hall/postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required; use test:postgres");

const request = {
  role: "hall_api_authenticated" as const,
  context: { requestId: "statement-timeout", actorId: null, contactId: null, roles: ["administrator"] },
};

// @verifies-requirement HALL-TR-DST-040
describe("account statements of the shared PostgreSQL access", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const locker = new Pool({ connectionString: databaseUrl, max: 1 });
  let client: PostgresClient;
  const previousTimeout = process.env.HALL_STATEMENT_TIMEOUT_MS;

  beforeAll(async () => {
    await new PostgresSchemaBootstrap(pool).install();
    process.env.HALL_STATEMENT_TIMEOUT_MS = "300";
    client = new PostgresClient(pool, false);
  });

  afterAll(async () => {
    if (previousTimeout === undefined) delete process.env.HALL_STATEMENT_TIMEOUT_MS;
    else process.env.HALL_STATEMENT_TIMEOUT_MS = previousTimeout;
    await pool.end();
    await locker.end();
  });

  async function whileAccountsLocked<Result>(operation: () => Promise<Result>): Promise<Result> {
    const connection = await locker.connect();
    try {
      await connection.query("BEGIN");
      await connection.query("LOCK TABLE hall.app_user IN ACCESS EXCLUSIVE MODE");
      return await operation();
    } finally {
      await connection.query("ROLLBACK");
      connection.release();
    }
  }

  it("stops a single statement and a transaction that exceed the interactive timeout", async () => {
    const single = await whileAccountsLocked(() =>
      client.administration.countUsers(request).catch((error: unknown) => error),
    );
    expect(single).toBeInstanceOf(StatementTimeoutError);
    expect(single).toMatchObject({ sqlState: "57014", budget: "interactive", timeoutMs: 300 });

    const transaction = await whileAccountsLocked(() =>
      client.transactions
        .transaction({ ...request, context: { ...request.context, action: "user.count" } }, () =>
          client.administration.countUsers(request),
        )
        .catch((error: unknown) => error),
    );
    expect(transaction).toBeInstanceOf(StatementTimeoutError);
  });

  it("lets a short statement pass and leaves no timeout on the pooled connection", async () => {
    await expect(client.administration.countUsers(request)).resolves.toEqual(expect.any(Number));
    const after = await pool.query<{ timeout: string }>("SELECT current_setting('statement_timeout') AS timeout");
    expect(after.rows[0].timeout).toBe("0");
  });
});
