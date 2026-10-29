import type { Pool } from "pg";
import { z } from "zod";
import type { PostgresRequest } from "./callContext.js";
import { callJson } from "./jsonCall.js";
import { PostgresTransactionManager } from "./transaction.js";

/** The object an action applies to, when a condition of the role matrix depends on it. */
export type PostgresAuthorizationTarget = Readonly<{ meetingId?: string; location?: string }>;

// @implements-requirement HALL-FR-DOC-350
/** Asks the role matrix and its conditions, delivered with the schema, whether the caller may act. */
export class PostgresAuthorization {
  private readonly transactions: PostgresTransactionManager;

  constructor(pool: Pool) {
    this.transactions = new PostgresTransactionManager(pool);
  }

  allows(
    request: PostgresRequest,
    action: string,
    target: PostgresAuthorizationTarget | null = null,
  ): Promise<boolean> {
    return this.transactions.run(
      { role: request.role, context: { ...request.context, action: "authorization.allows" } },
      (client) =>
        callJson(client, {
          text: "SELECT to_jsonb(hall_api.allows($1::text, $2::jsonb)) AS payload",
          values: [action, target ? JSON.stringify(target) : null],
          schema: z.boolean(),
        }),
    );
  }

  allowedActions(request: PostgresRequest, target: PostgresAuthorizationTarget | null = null): Promise<string[]> {
    return this.transactions.run(
      { role: request.role, context: { ...request.context, action: "authorization.allowed-actions" } },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.allowed_actions($1::jsonb) AS payload",
          values: [target ? JSON.stringify(target) : null],
          schema: z.array(z.string()),
        }),
    );
  }
}
