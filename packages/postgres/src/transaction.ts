import { AsyncLocalStorage } from "node:async_hooks";
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

type AmbientTransaction = {
  pool: Pool;
  client: PoolClient;
  queue: Promise<void>;
  open: boolean;
};

const ambientTransactions = new AsyncLocalStorage<AmbientTransaction>();

/** PostgreSQL ended the transaction with ROLLBACK at COMMIT because a statement of it had failed. */
export class TransactionRolledBackError extends Error {
  constructor() {
    super("PostgreSQL rolled the transaction back at COMMIT after a failed statement");
    this.name = "TransactionRolledBackError";
  }
}

/** Waits for every call joined to the ambient transaction, including calls started without await. */
async function settled(ambient: AmbientTransaction): Promise<void> {
  let queue: Promise<void>;
  do {
    queue = ambient.queue;
    await queue;
  } while (queue !== ambient.queue);
}

/** A serialization or deadlock failure anywhere in the cause chain makes the whole transaction retryable. */
function retryable(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if (retryableSqlStates.has(postgresSqlState(current) ?? "")) return true;
  }
  return false;
}

// 57014 is also raised by an explicit cancellation; only an attempt that lasted the whole
// timeout is reported as a timeout, whatever the language of the PostgreSQL message.
function timeoutOf(
  error: unknown,
  budget: StatementBudget,
  statementTimeoutMs: number,
  startedAt: number,
): StatementTimeoutError | undefined {
  if (error instanceof StatementTimeoutError) return error;
  if (
    statementTimeoutMs > 0 &&
    postgresSqlState(error) === "57014" &&
    performance.now() - startedAt >= statementTimeoutMs
  )
    return new StatementTimeoutError(budget, statementTimeoutMs, error);
  return undefined;
}

/** An error reported by the PostgreSQL server, as opposed to an error of the caller's own operation. */
function isServerError(error: unknown): boolean {
  return postgresSqlState(error) !== null && typeof error === "object" && error !== null && "severity" in error;
}

/**
 * Every call of a manager opens its own SERIALIZABLE transaction, unless it runs inside an open `transaction`
 * on the same pool: it then joins that transaction under its own role and call context, so that the
 * account and business writes of one request commit or roll back together. Work that outlives the
 * transaction, such as a callback created during it, opens its own transaction again.
 */
// @implements-requirement HALL-TR-SCH-040
export class PostgresTransactionManager {
  constructor(
    private readonly pool: Pool,
    private readonly statementTimeouts: StatementTimeouts = statementTimeoutsFromEnvironment(),
  ) {}

  /** True when the caller already runs inside a transaction of this pool. */
  active(): boolean {
    return this.ambient() !== undefined;
  }

  private ambient(): AmbientTransaction | undefined {
    const ambient = ambientTransactions.getStore();
    return ambient?.pool === this.pool && ambient.open ? ambient : undefined;
  }

  /** Runs several manager calls of this pool as one transaction, retried as a whole on serialization failure. */
  transaction<Result>(request: TransactionRequest, operation: () => Promise<Result>): Promise<Result> {
    if (this.active()) return operation();
    return this.attempts(
      request,
      async (client) => {
        const ambient: AmbientTransaction = { pool: this.pool, client, queue: Promise.resolve(), open: true };
        try {
          const result = await ambientTransactions.run(ambient, operation);
          await settled(ambient);
          return result;
        } finally {
          ambient.open = false;
        }
      },
      (error) => (isServerError(error) ? preservePostgresError(error) : error),
    );
  }

  run<Result>(request: TransactionRequest, operation: TransactionOperation<Result>): Promise<Result> {
    const ambient = this.ambient();
    if (!ambient) return this.attempts(request, operation);
    const joined = ambient.queue.then(async () => {
      const budget = statementBudgetOf(request.context.action);
      const statementTimeoutMs = this.statementTimeouts[budget];
      const startedAt = performance.now();
      try {
        await installCallContext(ambient.client, request.role, request.context, statementTimeoutMs);
        const result = await operation(ambient.client);
        if (request.audit) await recordAuditEvent(ambient.client, request.audit);
        return result;
      } catch (error) {
        throw timeoutOf(error, budget, statementTimeoutMs, startedAt) ?? preservePostgresError(error);
      }
    });
    ambient.queue = joined.then(
      () => undefined,
      () => undefined,
    );
    return joined;
  }

  private async attempts<Result>(
    request: TransactionRequest,
    operation: TransactionOperation<Result>,
    failure: (error: unknown) => unknown = preservePostgresError,
  ): Promise<Result> {
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
        const commit = await client.query("COMMIT");
        if (commit.command !== "COMMIT") throw new TransactionRolledBackError();
        return result;
      } catch (error) {
        await rollback(client);
        if (attempt < maxAttempts && retryable(error)) continue;
        if (error instanceof StatementTimeoutError) throw error;
        throw timeoutOf(error, budget, statementTimeoutMs, startedAt) ?? failure(error);
      } finally {
        client.release();
      }
    }

    throw new Error("PostgreSQL transaction exhausted its attempts");
  }
}
