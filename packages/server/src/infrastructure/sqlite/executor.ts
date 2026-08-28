import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { DatabaseRow } from "../../repositories/row.js";
import type { RequestContextStore } from "../../security/requestContext.js";
import { translatePersistenceError } from "../database/errors.js";
import {
  compileQuery,
  type SqlExecutor,
  type SqlParameters,
  type SqlRunResult,
  type SqlValue,
} from "../database/executor.js";
import type { SqlQueryName } from "../database/queries.js";

function sqliteValue(value: SqlValue): SQLInputValue {
  return typeof value === "boolean" ? (value ? 1 : 0) : value;
}

const queues = new Map<string, Promise<unknown>>();

export class SqliteExecutor implements SqlExecutor {
  readonly dialect = "sqlite" as const;
  readonly #transaction = new AsyncLocalStorage<boolean>();

  constructor(
    private readonly database: DatabaseSync,
    readonly requestContext: RequestContextStore,
    private readonly coordinationKey: string,
  ) {}

  all<Row extends DatabaseRow = DatabaseRow>(name: SqlQueryName, parameters?: SqlParameters): Promise<Row[]> {
    return this.#dispatch(() => {
      const query = compileQuery(name, this.dialect, parameters);
      return this.database.prepare(query.text).all(...query.values.map(sqliteValue)) as Row[];
    });
  }

  get<Row extends DatabaseRow = DatabaseRow>(name: SqlQueryName, parameters?: SqlParameters): Promise<Row | undefined> {
    return this.#dispatch(() => {
      const query = compileQuery(name, this.dialect, parameters);
      return this.database.prepare(query.text).get(...query.values.map(sqliteValue)) as Row | undefined;
    });
  }

  run(name: SqlQueryName, parameters?: SqlParameters): Promise<SqlRunResult> {
    return this.#dispatch(() => {
      const query = compileQuery(name, this.dialect, parameters);
      const result = this.database.prepare(query.text).run(...query.values.map(sqliteValue));
      return { changes: Number(result.changes) };
    });
  }

  execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#transaction.getStore()) return operation();
    return this.#enqueue(() =>
      this.#transaction.run(true, async () => {
        this.database.exec("BEGIN IMMEDIATE");
        try {
          const result = await operation();
          await this.#recordAudit(result);
          this.database.exec("COMMIT");
          return result;
        } catch (error) {
          this.database.exec("ROLLBACK");
          throw translatePersistenceError(error);
        }
      }),
    );
  }

  async ready(): Promise<void> {}

  async close(): Promise<void> {
    await this.#enqueue(() => this.database.close());
  }

  #dispatch<T>(operation: () => T): Promise<T> {
    if (this.#transaction.getStore()) return this.#perform(operation);
    return this.#enqueue(() => this.#perform(operation));
  }

  #enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
    const previous = queues.get(this.coordinationKey) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    queues.set(
      this.coordinationKey,
      result.then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  }

  async #perform<T>(operation: () => T): Promise<T> {
    try {
      return operation();
    } catch (error) {
      throw translatePersistenceError(error);
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
