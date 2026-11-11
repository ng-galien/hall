import type { Pool } from "pg";
import { z } from "zod";
import type { PostgresRequest } from "./callContext.js";
import { callJson } from "./jsonCall.js";
import { PostgresTransactionManager } from "./transaction.js";

/** A stored row of the administration model, in the snake_case columns of its table. */
export type PostgresAdministrationRow = Record<string, unknown>;

const rowSchema = z.record(z.string(), z.unknown());
const rowsSchema = z.array(rowSchema);
const optionalRowSchema = rowSchema.nullable();
const countSchema = z.number().int().nonnegative();

export type SavePostgresDocumentTemplate = Readonly<{
  kind: string;
  documentType: string;
  name: string;
  bodyMarkdown: string;
  subject: string | null;
  stylesheet: string;
  headerHtml: string;
  footerHtml: string;
}>;

export type UpdatePostgresHallSettings = Readonly<Record<string, unknown>>;

// @implements-requirement HALL-TR-SCH-030
/** Accounts, sessions, municipality settings, document templates and the audit journal, through hall_api. */
export class PostgresAdministration {
  private readonly transactions: PostgresTransactionManager;

  constructor(pool: Pool) {
    this.transactions = new PostgresTransactionManager(pool);
  }

  private call<Row>(
    request: PostgresRequest,
    action: string,
    text: string,
    values: readonly unknown[],
    schema: z.ZodType<Row>,
  ) {
    return this.transactions.run({ role: request.role, context: { ...request.context, action } }, (client) =>
      callJson(client, { text, values, schema }),
    );
  }

  countUsers(request: PostgresRequest) {
    return this.call(request, "user.count", "SELECT to_jsonb(hall_api.count_app_users()) AS payload", [], countSchema);
  }

  countActiveAdministrators(request: PostgresRequest) {
    return this.call(
      request,
      "user.count-administrators",
      "SELECT to_jsonb(hall_api.count_active_administrators()) AS payload",
      [],
      countSchema,
    );
  }

  lockAdministratorInvariant(request: PostgresRequest) {
    return this.call(
      request,
      "user.lock-administrators",
      "SELECT to_jsonb(hall_api.lock_administrator_invariant()) AS payload",
      [],
      z.literal(true),
    );
  }

  listUsers(request: PostgresRequest) {
    return this.call(request, "user.list", "SELECT hall_api.list_app_users() AS payload", [], rowsSchema);
  }

  openUser(request: PostgresRequest, id: string, lockForUpdate = false) {
    return this.call(
      request,
      "user.open",
      "SELECT hall_api.open_app_user($1::uuid, $2::boolean) AS payload",
      [id, lockForUpdate],
      optionalRowSchema,
    );
  }

  findUserByEmail(request: PostgresRequest, email: string) {
    return this.call(
      request,
      "user.find-by-email",
      "SELECT hall_api.find_app_user_by_email($1::text) AS payload",
      [email],
      optionalRowSchema,
    );
  }

  createUser(
    request: PostgresRequest,
    input: Readonly<{
      email: string;
      displayName: string;
      passwordHash: string;
      passwordChangeRequired?: boolean;
      contactId: string | null;
      roles: readonly string[];
    }>,
  ) {
    return this.call(
      request,
      "user.create",
      "SELECT hall_api.create_app_user($1::text, $2::text, $3::text, $4::uuid, $5::text[], $6::boolean) AS payload",
      [
        input.email,
        input.displayName,
        input.passwordHash,
        input.contactId,
        [...input.roles],
        input.passwordChangeRequired ?? false,
      ],
      rowSchema,
    );
  }

  bootstrapAdministrator(
    request: PostgresRequest,
    input: Readonly<{ email: string; displayName: string; passwordHash: string }>,
  ) {
    return this.call(
      request,
      "session.bootstrap",
      "SELECT hall_api.bootstrap_app_administrator($1::text, $2::text, $3::text) AS payload",
      [input.email, input.displayName, input.passwordHash],
      optionalRowSchema,
    );
  }

  setUserRoles(request: PostgresRequest, id: string, roles: readonly string[]) {
    return this.call(
      request,
      "user.assign-role",
      "SELECT hall_api.set_app_user_roles($1::uuid, $2::text[]) AS payload",
      [id, [...roles]],
      optionalRowSchema,
    );
  }

  updateUser(
    request: PostgresRequest,
    id: string,
    input: Readonly<{ email: string; displayName: string; contactId: string | null; passwordChangeRequired?: boolean }>,
  ) {
    return this.call(
      request,
      "user.update",
      "SELECT hall_api.update_app_user($1::uuid, $2::text, $3::text, $4::uuid, $5::boolean) AS payload",
      [id, input.email, input.displayName, input.contactId, input.passwordChangeRequired ?? null],
      optionalRowSchema,
    );
  }

  replacePassword(
    request: PostgresRequest,
    id: string,
    previousHash: string,
    passwordHash: string,
    passwordChangeRequired: boolean | null = false,
  ) {
    return this.call(
      request,
      "user.replace-password",
      "SELECT to_jsonb(hall_api.replace_app_user_password($1::uuid, $2::text, $3::text, $4::boolean)) AS payload",
      [id, previousHash, passwordHash, passwordChangeRequired],
      z.boolean(),
    );
  }

  reactivateUser(request: PostgresRequest, id: string, passwordHash: string) {
    return this.call(
      request,
      "user.reactivate",
      "SELECT hall_api.reactivate_app_user($1::uuid, $2::text) AS payload",
      [id, passwordHash],
      optionalRowSchema,
    );
  }

  disableUser(request: PostgresRequest, id: string) {
    return this.call(
      request,
      "user.revoke-access",
      "SELECT hall_api.disable_app_user($1::uuid) AS payload",
      [id],
      optionalRowSchema,
    );
  }

  createSession(request: PostgresRequest, userId: string, tokenHash: string, expiresAt: string) {
    return this.call(
      request,
      "session.create",
      "SELECT hall_api.create_app_session($1::uuid, $2::text, $3::timestamptz) AS payload",
      [userId, tokenHash, expiresAt],
      rowSchema,
    );
  }

  findSession(request: PostgresRequest, tokenHash: string) {
    return this.call(
      request,
      "session.resolve",
      "SELECT hall_api.find_app_session($1::text) AS payload",
      [tokenHash],
      optionalRowSchema,
    );
  }

  deleteSession(request: PostgresRequest, id: string) {
    return this.call(
      request,
      "session.delete",
      "SELECT to_jsonb(hall_api.delete_app_session($1::uuid)) AS payload",
      [id],
      z.boolean(),
    );
  }

  listAuditEvents(request: PostgresRequest, limit: number) {
    return this.call(
      request,
      "audit-event.list",
      "SELECT hall_api.list_audit_events($1::integer) AS payload",
      [limit],
      rowsSchema,
    );
  }

  openAuditEvent(request: PostgresRequest, id: string) {
    return this.call(
      request,
      "audit-event.open",
      "SELECT hall_api.open_audit_event($1::uuid) AS payload",
      [id],
      optionalRowSchema,
    );
  }

  /** Records an audit fact under the given action, in the current transaction when one is open. */
  recordAuditEvent(
    request: PostgresRequest,
    action: string,
    audit: Readonly<{
      targetType: string;
      targetId: string | null;
      outcome: "succeeded" | "denied" | "failed";
      details?: Readonly<Record<string, unknown>>;
    }>,
  ) {
    return this.transactions.run(
      { role: request.role, context: { ...request.context, action }, audit },
      async () => undefined,
    );
  }

  hallSettings(request: PostgresRequest) {
    return this.call(request, "settings.read", "SELECT hall_api.hall_settings() AS payload", [], optionalRowSchema);
  }

  updateHallSettings(request: PostgresRequest, settings: UpdatePostgresHallSettings, locations: readonly string[]) {
    return this.call(
      request,
      "settings.update",
      "SELECT hall_api.update_hall_settings($1::jsonb, $2::text[]) AS payload",
      [JSON.stringify(settings), [...locations]],
      optionalRowSchema,
    );
  }

  listDocumentTemplates(request: PostgresRequest) {
    return this.call(request, "template.list", "SELECT hall_api.list_document_templates() AS payload", [], rowsSchema);
  }

  openDocumentTemplate(request: PostgresRequest, id: string) {
    return this.call(
      request,
      "template.open",
      "SELECT hall_api.open_document_template($1::uuid) AS payload",
      [id],
      optionalRowSchema,
    );
  }

  createDocumentTemplate(request: PostgresRequest, input: SavePostgresDocumentTemplate) {
    return this.call(
      request,
      "template.create",
      "SELECT hall_api.create_document_template($1::jsonb) AS payload",
      [JSON.stringify(input)],
      rowSchema,
    );
  }

  updateDocumentTemplate(request: PostgresRequest, id: string, input: SavePostgresDocumentTemplate) {
    return this.call(
      request,
      "template.update",
      "SELECT hall_api.update_document_template($1::uuid, $2::jsonb) AS payload",
      [id, JSON.stringify(input)],
      optionalRowSchema,
    );
  }

  deleteDocumentTemplate(request: PostgresRequest, id: string) {
    return this.call(
      request,
      "template.delete",
      "SELECT to_jsonb(hall_api.delete_document_template($1::uuid)) AS payload",
      [id],
      z.boolean(),
    );
  }
}
