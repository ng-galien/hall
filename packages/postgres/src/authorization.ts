import {
  type AuthorizationRoleInput,
  authorizationConfigurationSchema,
  authorizationRoleOptionSchema,
  authorizationRoleSchema,
} from "@hall/contracts";
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

  requiresPersonalWorkspace(request: PostgresRequest, roles: readonly string[]) {
    return this.transactions.run(
      { role: request.role, context: { ...request.context, action: "role.workspace-policy" } },
      (client) =>
        callJson(client, {
          text: "SELECT to_jsonb(hall_api.authorization_requires_personal_workspace($1::text[])) AS payload",
          values: [roles],
          schema: z.boolean(),
        }),
    );
  }

  roleOptions(request: PostgresRequest) {
    return this.transactions.run(
      { role: request.role, context: { ...request.context, action: "role.options" } },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.authorization_role_options() AS payload",
          schema: z.array(authorizationRoleOptionSchema),
        }),
    );
  }

  configuration(request: PostgresRequest) {
    return this.transactions.run(
      { role: request.role, context: { ...request.context, action: "role.list" } },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.authorization_configuration() AS payload",
          schema: authorizationConfigurationSchema,
        }),
    );
  }

  saveRole(request: PostgresRequest, id: string, input: AuthorizationRoleInput) {
    return this.transactions.run(
      {
        role: request.role,
        context: { ...request.context, action: input.revision === 0 ? "role.create" : "role.update" },
      },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.save_authorization_role($1::text, $2::jsonb) AS payload",
          values: [id, JSON.stringify(input)],
          schema: authorizationRoleSchema,
        }),
    );
  }

  deleteRole(request: PostgresRequest, id: string, revision: number) {
    return this.transactions.run(
      { role: request.role, context: { ...request.context, action: "role.delete" } },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.delete_authorization_role($1::text, $2::integer) AS payload",
          values: [id, revision],
          schema: authorizationRoleSchema,
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
