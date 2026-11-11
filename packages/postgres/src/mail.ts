import {
  type MailDraft,
  type MailSource,
  mailMessageSchema,
  mailPreviewSchema,
  mailRecipientGroupSchema,
  mailSubmissionSchema,
} from "@hall/contracts";
import type { Pool } from "pg";
import { z } from "zod";
import type { PostgresRequest } from "./callContext.js";
import { callJson } from "./jsonCall.js";
import { PostgresTransactionManager } from "./transaction.js";

// @implements-requirement HALL-FR-EML-010
export class PostgresMail {
  private readonly transactions: PostgresTransactionManager;
  constructor(pool: Pool) {
    this.transactions = new PostgresTransactionManager(pool);
  }
  private call<T>(
    request: PostgresRequest,
    action: string,
    sql: string,
    values: readonly unknown[],
    schema: z.ZodType<T>,
  ) {
    return this.transactions.run({ role: request.role, context: { ...request.context, action } }, (client) =>
      callJson(client, { text: sql, values, schema }),
    );
  }
  snapshot(r: Parameters<PostgresMail["open"]>[0], id: string) {
    return this.call(
      r,
      "mail.read-submission",
      "SELECT hall_api.read_mail_submission($1::uuid) AS payload",
      [id],
      mailPreviewSchema.nullable(),
    );
  }
  snapshotAttachment(r: Parameters<PostgresMail["open"]>[0], id: string, attachmentId: string) {
    return this.call(
      r,
      "mail.read-submission-attachment",
      "SELECT hall_api.read_mail_submission_attachment($1::uuid,$2::uuid) AS payload",
      [id, attachmentId],
      z.object({ fileName: z.string(), mediaType: z.string(), base64: z.string() }).nullable(),
    );
  }
  list(r: PostgresRequest) {
    return this.call(r, "mail.list", "SELECT hall_api.list_mail() AS payload", [], z.array(mailMessageSchema));
  }
  open(r: PostgresRequest, id: string) {
    return this.call(
      r,
      "mail.open",
      "SELECT hall_api.open_mail($1::uuid) AS payload",
      [id],
      mailMessageSchema.nullable(),
    );
  }
  create(r: PostgresRequest, input: MailDraft & { source?: MailSource }) {
    return this.call(r, "mail.create", "SELECT hall_api.create_mail($1::jsonb) AS payload", [input], mailMessageSchema);
  }
  update(r: PostgresRequest, id: string, revision: number, input: MailDraft) {
    return this.call(
      r,
      "mail.update",
      "SELECT hall_api.update_mail($1::uuid,$2::integer,$3::jsonb) AS payload",
      [id, revision, input],
      mailMessageSchema,
    );
  }
  delete(r: PostgresRequest, id: string, revision: number) {
    return this.call(
      r,
      "mail.delete",
      "SELECT hall_api.delete_mail($1::uuid,$2::integer) AS payload",
      [id, revision],
      z.boolean(),
    );
  }
  attach(
    r: PostgresRequest,
    id: string,
    revision: number,
    file: { fileName: string; mediaType: string; content: Buffer; resourceId: string | null },
  ) {
    return this.call(
      r,
      "mail.attach",
      "SELECT hall_api.attach_mail_file($1::uuid,$2::integer,$3::text,$4::text,$5::bytea,$6::uuid) AS payload",
      [id, revision, file.fileName, file.mediaType, file.content, file.resourceId],
      mailMessageSchema,
    );
  }
  removeAttachment(r: PostgresRequest, id: string, revision: number, attachmentId: string) {
    return this.call(
      r,
      "mail.remove-attachment",
      "SELECT hall_api.remove_mail_attachment($1::uuid,$2::integer,$3::uuid) AS payload",
      [id, revision, attachmentId],
      mailMessageSchema,
    );
  }
  attachment(r: PostgresRequest, id: string, attachmentId: string) {
    return this.call(
      r,
      "mail.read-attachment",
      "SELECT hall_api.read_mail_attachment($1::uuid,$2::uuid) AS payload",
      [id, attachmentId],
      z.object({ fileName: z.string(), mediaType: z.string(), base64: z.string() }).nullable(),
    );
  }
  claimSubmission(r: PostgresRequest, id: string, revision: number, key: string, prepared: unknown) {
    return this.call(
      r,
      "mail.send",
      "SELECT hall_api.begin_mail_submission($1::uuid,$2::integer,$3::uuid,$4::jsonb) AS payload",
      [id, revision, key, prepared],
      z.object({ created: z.boolean(), submission: mailSubmissionSchema }),
    );
  }
  finish(r: PostgresRequest, id: string, status: "accepted" | "failed" | "unknown", code: string | null) {
    return this.call(
      r,
      "mail.finish",
      "SELECT hall_api.finish_mail_submission($1::uuid,$2::text,$3::text) AS payload",
      [id, status, code],
      mailSubmissionSchema,
    );
  }
  verify(r: PostgresRequest, id: string, outcome: "sent" | "not-sent", notes: string) {
    return this.call(
      r,
      "mail.verify-submission",
      "SELECT hall_api.verify_mail_submission($1::uuid,$2::text,$3::text) AS payload",
      [id, outcome, notes],
      mailSubmissionSchema,
    );
  }
  groups(r: PostgresRequest) {
    return this.call(
      r,
      "mail-group.list",
      "SELECT hall_api.list_mail_recipient_groups() AS payload",
      [],
      z.array(mailRecipientGroupSchema),
    );
  }
  saveGroup(
    r: PostgresRequest,
    id: string | null,
    revision: number | null,
    input: { name: string; members: unknown[] },
  ) {
    return this.call(
      r,
      id ? "mail-group.update" : "mail-group.create",
      "SELECT hall_api.save_mail_recipient_group($1::uuid,$2::integer,$3::jsonb) AS payload",
      [id, revision, input],
      mailRecipientGroupSchema,
    );
  }
  deleteGroup(r: PostgresRequest, id: string, revision: number) {
    return this.call(
      r,
      "mail-group.delete",
      "SELECT hall_api.delete_mail_recipient_group($1::uuid,$2::integer) AS payload",
      [id, revision],
      z.boolean(),
    );
  }
}
