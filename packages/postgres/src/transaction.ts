import type { Pool, PoolClient } from "pg";
import { type AuditIntent, recordAuditEvent } from "./audit.js";
import { type DatabaseRole, type PostgresCallContext, parseDatabaseRole } from "./callContext.js";
import { postgresSqlState, preservePostgresError } from "./errors.js";

const retryableSqlStates = new Set(["40001", "40P01"]);

export type TransactionRequest = Readonly<{
  role: DatabaseRole;
  context: PostgresCallContext;
  audit?: AuditIntent;
  maxAttempts?: number;
}>;

export type TransactionOperation<Result> = (client: PoolClient) => Promise<Result>;

async function installCallContext(client: PoolClient, role: DatabaseRole, context: PostgresCallContext): Promise<void> {
  const trustedRole = parseDatabaseRole(role);
  await client.query(`SET LOCAL ROLE ${trustedRole}`);
  await client.query(
    `SELECT
       set_config('hall.request_id', $1, true),
       set_config('hall.actor_id', $2, true),
       set_config('hall.action', $3, true),
       set_config('hall.council_member_id', $4, true),
       set_config('hall.roles', $5, true)`,
    [
      context.requestId,
      context.actorId ?? "",
      context.action,
      context.councilMemberId ?? "",
      JSON.stringify(context.roles ?? []),
    ],
  );
}

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    return;
  }
}

export class PostgresTransactionManager {
  constructor(private readonly pool: Pool) {}

  async run<Result>(request: TransactionRequest, operation: TransactionOperation<Result>): Promise<Result> {
    const maxAttempts = request.maxAttempts ?? 3;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1)
      throw new RangeError("maxAttempts must be a positive integer");

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        await installCallContext(client, request.role, request.context);
        const result = await operation(client);
        if (request.audit) await recordAuditEvent(client, request.audit);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await rollback(client);
        if (attempt < maxAttempts && retryableSqlStates.has(postgresSqlState(error) ?? "")) continue;
        throw preservePostgresError(error);
      } finally {
        client.release();
      }
    }

    throw new Error("PostgreSQL transaction exhausted its attempts");
  }
}
