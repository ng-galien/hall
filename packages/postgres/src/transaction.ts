import type { Pool, PoolClient } from "pg";
import { type AuditIntent, recordAuditEvent } from "./audit.js";
import { type DatabaseRole, type PostgresCallContext, parseDatabaseRole } from "./callContext.js";
import { postgresSqlState, preservePostgresError, StatementTimeoutError } from "./errors.js";

const retryableSqlStates = new Set(["40001", "40P01"]);

/**
 * Statement budgets of a transaction. `interactive` bounds API reads and ordinary commands;
 * `document` bounds commands that store generated documents, uploaded files or snapshots.
 */
export const statementBudgets = ["interactive", "document"] as const;
export type StatementBudget = (typeof statementBudgets)[number];

/** Call-context actions that run under the document budget; every other action is interactive. */
export const documentStatementActions: ReadonlySet<string> = new Set([
  "meeting.generate-notice",
  "council-business.import-bundle",
  "meeting.record-opening",
  "meeting.close",
  "decision.freeze",
  "minutes.generate",
  "resource.createDocument",
  "resource.replaceDocumentContent",
  "editorAsset.create",
]);

export function statementBudgetOf(action: string): StatementBudget {
  return documentStatementActions.has(action) ? "document" : "interactive";
}

/** Statement timeout per budget in milliseconds; 0 disables the timeout as in PostgreSQL. */
export type StatementTimeouts = Readonly<Record<StatementBudget, number>>;

export const defaultStatementTimeouts: StatementTimeouts = { interactive: 15_000, document: 120_000 };

const statementTimeoutVariables: Readonly<Record<StatementBudget, string>> = {
  interactive: "HALL_STATEMENT_TIMEOUT_MS",
  document: "HALL_DOCUMENT_STATEMENT_TIMEOUT_MS",
};

// @implements-requirement HALL-TR-DST-040
export function statementTimeoutsFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): StatementTimeouts {
  const timeout = (budget: StatementBudget): number => {
    const variable = statementTimeoutVariables[budget];
    const raw = environment[variable];
    if (raw === undefined || raw.trim() === "") return defaultStatementTimeouts[budget];
    if (!/^\d+$/.test(raw.trim())) throw new RangeError(`${variable} must be a whole number of milliseconds`);
    return Number.parseInt(raw.trim(), 10);
  };
  return { interactive: timeout("interactive"), document: timeout("document") };
}

export type TransactionRequest = Readonly<{
  role: DatabaseRole;
  context: PostgresCallContext;
  audit?: AuditIntent;
  maxAttempts?: number;
}>;

export type TransactionOperation<Result> = (client: PoolClient) => Promise<Result>;

async function installCallContext(
  client: PoolClient,
  role: DatabaseRole,
  context: PostgresCallContext,
  statementTimeoutMs: number,
): Promise<void> {
  const trustedRole = parseDatabaseRole(role);
  await client.query(`SET LOCAL ROLE ${trustedRole}`);
  await client.query(
    `SELECT
       set_config('hall.request_id', $1, true),
       set_config('hall.actor_id', $2, true),
       set_config('hall.action', $3, true),
       set_config('hall.contact_id', $4, true),
       set_config('hall.roles', $5, true),
       set_config('statement_timeout', $6, true)`,
    [
      context.requestId,
      context.actorId ?? "",
      context.action,
      context.contactId ?? "",
      JSON.stringify(context.roles ?? []),
      String(statementTimeoutMs),
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
  constructor(
    private readonly pool: Pool,
    private readonly statementTimeouts: StatementTimeouts = statementTimeoutsFromEnvironment(),
  ) {}

  async run<Result>(request: TransactionRequest, operation: TransactionOperation<Result>): Promise<Result> {
    const maxAttempts = request.maxAttempts ?? 3;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1)
      throw new RangeError("maxAttempts must be a positive integer");
    const budget = statementBudgetOf(request.context.action);
    const statementTimeoutMs = this.statementTimeouts[budget];

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const client = await this.pool.connect();
      const startedAt = performance.now();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        await installCallContext(client, request.role, request.context, statementTimeoutMs);
        const result = await operation(client);
        if (request.audit) await recordAuditEvent(client, request.audit);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await rollback(client);
        if (attempt < maxAttempts && retryableSqlStates.has(postgresSqlState(error) ?? "")) continue;
        // 57014 is also raised by an explicit cancellation; only an attempt that lasted the whole
        // timeout is reported as a timeout, whatever the language of the PostgreSQL message.
        if (
          statementTimeoutMs > 0 &&
          postgresSqlState(error) === "57014" &&
          performance.now() - startedAt >= statementTimeoutMs
        ) {
          throw new StatementTimeoutError(budget, statementTimeoutMs, error);
        }
        throw preservePostgresError(error);
      } finally {
        client.release();
      }
    }

    throw new Error("PostgreSQL transaction exhausted its attempts");
  }
}
