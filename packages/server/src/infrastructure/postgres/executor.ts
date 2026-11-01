import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { PersistenceError } from "../../repositories/errors.js";
import type { DatabaseRow } from "../../repositories/row.js";
import { inferAuditTargetId, type RequestContextStore } from "../../security/requestContext.js";
import { translatePersistenceError } from "../database/errors.js";
import { compileQuery, type SqlExecutor, type SqlParameters, type SqlRunResult } from "../database/executor.js";
import type { SqlQueryName } from "../database/queries.js";
import { logIdleConnectionFailures } from "./idleConnectionFailures.js";
import {
  formerMeetingEngineTables,
  postgresDocumentConfigurationMigration,
  postgresFormerMeetingEngineRemoval,
  postgresSchema,
  postgresTables,
  postgresUserContactMigration,
  postgresUserRoleCatalogSchema,
} from "./schema.js";

type TransactionContext = {
  client: PoolClient;
  queue: Promise<void>;
};

// The caller owns the transaction. This initializer never commits or releases the client.
export async function initializeServerSchema(
  client: PoolClient,
  mode: "automatic" | "verify-only" = "automatic",
): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('hall.schema.bootstrap'))");
  const result = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  const tables = result.rows.map((row) => row.table_name);
  if (tables.length === 0) {
    if (mode === "verify-only") throw new Error("PostgreSQL schema is absent; run hall migrate before starting Hall");
    await client.query(postgresSchema);
  } else {
    const formerTables: readonly string[] = formerMeetingEngineTables;
    const serverTables: readonly string[] = postgresTables;
    if (
      serverTables.some((table) => !tables.includes(table)) ||
      tables.some((table) => !serverTables.includes(table) && !formerTables.includes(table))
    ) {
      throw new Error("Unsupported PostgreSQL schema; inspect compatibility before running hall migrate");
    }
    if (mode === "verify-only") {
      if (tables.some((table) => formerTables.includes(table))) {
        throw new Error("Former meeting engine tables remain; run hall migrate before starting Hall");
      }
      const userColumns = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'users'`,
      );
      if (
        !userColumns.rows.some((row) => row.column_name === "contact_id") ||
        userColumns.rows.some((row) => row.column_name === "council_member_id")
      ) {
        throw new Error("Server user schema requires migration; run hall migrate before starting Hall");
      }
      await verifyServerInvariants(client);
    }
  }
  if (mode === "automatic") {
    await client.query(postgresDocumentConfigurationMigration);
    await client.query(postgresUserContactMigration);
    await client.query(postgresUserRoleCatalogSchema);
    await client.query(postgresFormerMeetingEngineRemoval);
  }
}

async function verifyServerInvariants(client: PoolClient): Promise<void> {
  const result = await client.query<{ valid: boolean }>(
    `SELECT EXISTS (
       SELECT FROM pg_catalog.pg_constraint c
       WHERE c.conrelid = to_regclass(format('%I.user_roles', current_schema()))
         AND c.conname = 'user_roles_catalog'
         AND c.confrelid = 'hall.authorization_role'::regclass
     ) AND (SELECT count(*) = 2 FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'hall_settings'
         AND column_name IN ('outbound_email_signature_markdown', 'outbound_email_footer_markdown')) AS valid`,
  );
  if (result.rows[0]?.valid !== true) {
    throw new Error("Server schema invariants require migration; run hall migrate before starting Hall");
  }
}

export class PostgresExecutor implements SqlExecutor {
  readonly dialect = "postgres" as const;
  readonly #pool: Pool;
  readonly #transaction = new AsyncLocalStorage<TransactionContext>();
  readonly #ready: Promise<void>;

  constructor(
    connectionString: string,
    readonly requestContext: RequestContextStore,
    private readonly sharedPool?: Pool,
    private readonly schemaUpgradeMode: "automatic" | "verify-only" = "automatic",
  ) {
    this.#pool =
      sharedPool ?? logIdleConnectionFailures(new Pool({ connectionString, options: "-c search_path=public" }));
    this.#ready = this.#initialize();
  }

  async all<Row extends DatabaseRow = DatabaseRow>(name: SqlQueryName, parameters?: SqlParameters): Promise<Row[]> {
    await this.#ready;
    const query = compileQuery(name, this.dialect, parameters);
    try {
      const result = await this.#query<QueryResultRow>(query.text, query.values);
      return result.rows as Row[];
    } catch (error) {
      throw translatePersistenceError(error);
    }
  }

  async get<Row extends DatabaseRow = DatabaseRow>(
    name: SqlQueryName,
    parameters?: SqlParameters,
  ): Promise<Row | undefined> {
    return (await this.all<Row>(name, parameters))[0];
  }

  async run(name: SqlQueryName, parameters?: SqlParameters): Promise<SqlRunResult> {
    await this.#ready;
    const query = compileQuery(name, this.dialect, parameters);
    try {
      const result = await this.#query(query.text, query.values);
      return { changes: result.rowCount ?? 0 };
    } catch (error) {
      throw translatePersistenceError(error);
    }
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#transaction.getStore()) return operation();
    await this.#ready;
    const context = this.requestContext.current();
    const auditRecordedBeforeTransaction = context?.auditRecorded ?? false;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (context) context.auditRecorded = auditRecordedBeforeTransaction;
      const client = await this.#pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        try {
          return await this.#transaction.run({ client, queue: Promise.resolve() }, async () => {
            const result = await operation();
            await this.#recordAudit(result);
            await client.query("COMMIT");
            return result;
          });
        } catch (error) {
          await client.query("ROLLBACK");
          if (attempt < 3 && isRetryableTransactionError(error)) continue;
          if (context) context.auditRecorded = auditRecordedBeforeTransaction;
          throw translatePersistenceError(error);
        }
      } finally {
        client.release();
      }
    }
    throw new Error("Unreachable PostgreSQL transaction retry state");
  }

  ready(): Promise<void> {
    return this.#ready;
  }

  async close(): Promise<void> {
    await this.#ready.catch(() => undefined);
    if (!this.sharedPool) await this.#pool.end();
  }

  #query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
    const transaction = this.#transaction.getStore();
    if (!transaction) return this.#pool.query<Row>(text, values);
    const result = transaction.queue.then(() => transaction.client.query<Row>(text, values));
    transaction.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #initialize(): Promise<void> {
    const client = await this.#pool.connect();
    try {
      await client.query(this.schemaUpgradeMode === "verify-only" ? "BEGIN READ ONLY" : "BEGIN");
      try {
        await initializeServerSchema(client, this.schemaUpgradeMode);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    } finally {
      client.release();
    }
  }

  async #recordAudit(result: unknown): Promise<void> {
    const context = this.requestContext.current();
    if (!context?.audit || context.auditRecorded) return;
    const actorId = context.principal?.id;
    const storedActor = actorId ? await this.get("security.actorExists", { actorUserId: actorId }) : undefined;
    const inferredTargetId = inferAuditTargetId(context.audit, result);
    await this.run("security.insertAuditEvent", {
      id: randomUUID(),
      actorUserId: storedActor ? (actorId ?? null) : null,
      requestId: context.requestId,
      action: context.audit.action,
      targetType: context.audit.targetType,
      targetId: context.audit.targetId ?? inferredTargetId ?? null,
      outcome: "succeeded",
      detailsJson: JSON.stringify({
        ...context.audit.details,
        actor: context.principal ? { id: context.principal.id, displayName: context.principal.displayName } : null,
      }),
      occurredAt: new Date().toISOString(),
    });
    context.auditRecorded = true;
  }
}

function isRetryableTransactionError(error: unknown): boolean {
  if (error instanceof PersistenceError) return isRetryableTransactionError(error.cause);
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    (error.code === "40001" || error.code === "40P01")
  );
}
