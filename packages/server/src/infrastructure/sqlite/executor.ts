import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { UnitOfWork } from "../../repositories/contracts.js";
import { PersistenceError } from "../../repositories/errors.js";
import type { RequestContextStore } from "../../security/requestContext.js";

function translateSqliteError(error: unknown): unknown {
  if (error instanceof PersistenceError) return error;
  if (
    error instanceof Error &&
    "errcode" in error &&
    typeof error.errcode === "number" &&
    (error.errcode & 0xff) === 19
  ) {
    return new PersistenceError("conflict", { cause: error });
  }
  return error;
}

export class SqliteExecutor implements UnitOfWork {
  readonly database: DatabaseSync;
  readonly #transaction = new AsyncLocalStorage<boolean>();
  #queue: Promise<unknown> = Promise.resolve();

  constructor(
    database: DatabaseSync,
    readonly requestContext: RequestContextStore,
  ) {
    this.database = database;
  }

  run<T>(operation: (database: DatabaseSync) => T): Promise<T> {
    if (this.#transaction.getStore()) return this.#perform(() => operation(this.database));
    return this.#enqueue(() => this.#perform(() => operation(this.database)));
  }

  execute<T>(operation: () => Promise<T>): Promise<T> {
    return this.#enqueue(() =>
      this.#transaction.run(true, async () => {
        this.database.exec("BEGIN IMMEDIATE");
        try {
          const result = await operation();
          this.#recordAudit(result);
          this.database.exec("COMMIT");
          return result;
        } catch (error) {
          this.database.exec("ROLLBACK");
          throw translateSqliteError(error);
        }
      }),
    );
  }

  async close(): Promise<void> {
    await this.#enqueue(() => this.database.close());
  }

  #enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.#queue.then(operation, operation);
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #perform<T>(operation: () => T): Promise<T> {
    try {
      return operation();
    } catch (error) {
      throw translateSqliteError(error);
    }
  }

  #recordAudit(result: unknown): void {
    const context = this.requestContext.current();
    if (!context?.audit || context.auditRecorded) return;
    const actorId = context.principal?.id;
    const storedActor = actorId ? this.database.prepare("SELECT id FROM users WHERE id = ?").get(actorId) : undefined;
    const inferredTargetId =
      result && typeof result === "object" && "id" in result && typeof result.id === "string" ? result.id : null;
    this.database
      .prepare(
        `INSERT INTO audit_events
          (id, actor_user_id, request_id, action, target_type, target_id, outcome, details_json, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, 'succeeded', ?, ?)`,
      )
      .run(
        randomUUID(),
        storedActor ? (actorId ?? null) : null,
        context.requestId,
        context.audit.action,
        context.audit.targetType,
        context.audit.targetId ?? inferredTargetId ?? null,
        JSON.stringify({
          ...context.audit.details,
          actor: context.principal ? { id: context.principal.id, displayName: context.principal.displayName } : null,
        }),
        new Date().toISOString(),
      );
    context.auditRecorded = true;
  }
}
