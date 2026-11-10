import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { PostgresTransactionManager } from "../src/transaction.js";

const context = { requestId: "request-1", actorId: null, action: "test.command", contactId: null } as const;
const timeouts = { interactive: 1_000, document: 1_000 };

function poolWith(rollbackFailure: Error | null) {
  const release = vi.fn();
  const client = {
    query: vi.fn(async (sql: string) => {
      if (sql === "ROLLBACK" && rollbackFailure) throw rollbackFailure;
      return { command: sql.split(" ")[0], rows: [] };
    }),
    release,
  } as unknown as PoolClient;
  const pool = { connect: async () => client } as unknown as Pool;
  return { pool, release };
}

describe("connection release after a failed transaction", () => {
  it("destroys the connection when the ROLLBACK fails", async () => {
    const rollbackFailure = new Error("connection terminated");
    const { pool, release } = poolWith(rollbackFailure);
    const transactions = new PostgresTransactionManager(pool, timeouts);
    await expect(
      transactions.run({ role: "hall_api_authenticated", context }, async () => {
        throw new Error("operation failed");
      }),
    ).rejects.toThrow("operation failed");
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(rollbackFailure);
  });

  it("returns the connection to the pool when the ROLLBACK succeeds", async () => {
    const { pool, release } = poolWith(null);
    const transactions = new PostgresTransactionManager(pool, timeouts);
    await expect(
      transactions.run({ role: "hall_api_authenticated", context }, async () => {
        throw new Error("operation failed");
      }),
    ).rejects.toThrow("operation failed");
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(undefined);
  });
});
