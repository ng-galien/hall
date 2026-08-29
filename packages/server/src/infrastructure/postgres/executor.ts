import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { PersistenceError } from "../../repositories/errors.js";
import type { DatabaseRow } from "../../repositories/row.js";
import type { RequestContextStore } from "../../security/requestContext.js";
import { translatePersistenceError } from "../database/errors.js";
import { compileQuery, type SqlExecutor, type SqlParameters, type SqlRunResult } from "../database/executor.js";
import type { SqlQueryName } from "../database/queries.js";
import { postgresSchema, postgresTables } from "./schema.js";

export class PostgresExecutor implements SqlExecutor {
  readonly dialect = "postgres" as const;
  readonly #pool: Pool;
  readonly #transaction = new AsyncLocalStorage<PoolClient>();
  readonly #ready: Promise<void>;

  constructor(
    connectionString: string,
    readonly requestContext: RequestContextStore,
  ) {
    this.#pool = new Pool({ connectionString });
    this.#ready = this.#initialize();
  }

  async all<Row extends DatabaseRow = DatabaseRow>(name: SqlQueryName, parameters?: SqlParameters): Promise<Row[]> {
    await this.#ready;
    const query = compileQuery(name, this.dialect, parameters);
    try {
      const result = await this.#client().query<QueryResultRow>(query.text, query.values);
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
      const result = await this.#client().query(query.text, query.values);
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
          return await this.#transaction.run(client, async () => {
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
    await this.#pool.end();
  }

  #client(): Pool | PoolClient {
    return this.#transaction.getStore() ?? this.#pool;
  }

  async #initialize(): Promise<void> {
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      try {
        await client.query("SELECT pg_advisory_xact_lock(hashtext('hall.schema.bootstrap'))");
        const result = await client.query<{ table_name: string }>(
          `SELECT table_name FROM information_schema.tables
           WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
           ORDER BY table_name`,
        );
        const tables = result.rows.map((row) => row.table_name);
        if (tables.length === 0) {
          await client.query(postgresSchema);
        } else {
          const expected = [...postgresTables].sort();
          if (tables.length !== expected.length || tables.some((table, index) => table !== expected[index])) {
            throw new Error("Unsupported PostgreSQL schema: reset the database before starting Hall");
          }
          const votesColumns = await client.query<{ column_name: string }>(
            `SELECT column_name FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'votes'`,
          );
          if (!votesColumns.rows.some((row) => row.column_name === "position")) {
            throw new Error("Obsolete PostgreSQL schema: reset the database before starting Hall");
          }
          const documentColumns = await client.query<{ column_name: string }>(
            `SELECT column_name FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'resource_documents'`,
          );
          if (
            !documentColumns.rows.some((row) => row.column_name === "format") ||
            !documentColumns.rows.some((row) => row.column_name === "content_sha256")
          ) {
            throw new Error("Obsolete PostgreSQL schema: reset the database before starting Hall");
          }
        }
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
    const inferredTargetId =
      result && typeof result === "object" && "id" in result && typeof result.id === "string" ? result.id : null;
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
