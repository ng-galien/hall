import {
  type AccountMailKind,
  type AccountMailOutcome,
  type ApiRole,
  type ApiUser,
  accountMailKindSchema,
  accountMailOutcomeSchema,
  apiRoleSchema,
  apiUserStatusSchema,
  type PasswordLinkPurpose,
  passwordLinkPurposeSchema,
} from "@hall/api-contract";
import { identifierSchema } from "@hall/domain";
import type { PostgresClient } from "@hall/postgres";
import { z } from "zod";
import { administrationCall, administrationRequest } from "../infrastructure/postgres/administrationRequest.js";
import type { RequestContextStore } from "../security/requestContext.js";
import { asNullableString, asString, type DatabaseRow } from "./row.js";

export interface StoredUser extends ApiUser {
  passwordHash: string;
}
export interface StoredSession {
  id: string;
  userId: string;
  expiresAt: string;
}
export interface AuditEvent {
  id: string;
  actorUserId: string | null;
  requestId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  outcome: AuditOutcome;
  details: Record<string, unknown>;
  occurredAt: string;
}

const auditOutcomes = ["succeeded", "denied", "failed"] as const;
type AuditOutcome = (typeof auditOutcomes)[number];
const auditOutcomeSchema = z.enum(auditOutcomes);
const auditDetailsSchema = z.record(z.string(), z.unknown());

function mapUser(row: DatabaseRow): StoredUser {
  return {
    id: identifierSchema.parse(row.id),
    email: asString(row.email, "security_user.email"),
    displayName: asString(row.display_name, "security_user.display_name"),
    passwordHash: asString(row.password_hash, "security_user.password_hash"),
    status: apiUserStatusSchema.parse(row.status),
    passwordChangeRequired: z.boolean().parse(row.password_change_required),
    contactId: identifierSchema.nullable().parse(row.contact_id),
    roles: z.array(apiRoleSchema).parse(row.roles),
    accountMail: accountMailSchema.parse(row.account_mail ?? null),
    createdAt: asString(row.created_at, "security_user.created_at"),
    updatedAt: asString(row.updated_at, "security_user.updated_at"),
  };
}

const accountMailSchema = z
  .object({ kind: accountMailKindSchema, outcome: accountMailOutcomeSchema, sent_at: z.string() })
  .transform(({ kind, outcome, sent_at }) => ({ kind, outcome, sentAt: sent_at }))
  .nullable();

const issuedPasswordLinkSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      outcome: z.literal("issued"),
      purpose: passwordLinkPurposeSchema,
      expires_at: z.string(),
      email: z.string(),
      display_name: z.string(),
    })
    .transform(({ outcome, purpose, expires_at, email, display_name }) => ({
      outcome,
      purpose,
      expiresAt: expires_at,
      email,
      displayName: display_name,
    })),
  z.object({ outcome: z.enum(["too_frequent", "inactive", "not_found"]) }),
]);
export type IssuedPasswordLink = z.infer<typeof issuedPasswordLinkSchema>;

const openedPasswordLinkSchema = z
  .object({ purpose: passwordLinkPurposeSchema, email: z.string(), user_id: identifierSchema })
  .transform(({ purpose, email, user_id }) => ({ purpose, email, userId: user_id }))
  .nullable();

const accountMailSenderSchema = z
  .object({
    name: z.string(),
    sender_name: z.string(),
    sender_address: z.string().nullable(),
    reply_to_address: z.string().nullable(),
    time_zone: z.string(),
  })
  .transform((row) => ({
    communeName: row.name,
    senderName: row.sender_name,
    senderAddress: row.sender_address,
    replyToAddress: row.reply_to_address,
    timeZone: row.time_zone,
  }));
export type AccountMailSender = z.infer<typeof accountMailSenderSchema>;

const optionalUser = (row: DatabaseRow | null) => (row ? mapUser(row) : null);
const isIdentifier = (value: string) => identifierSchema.safeParse(value).success;

function mapAuditEvent(row: DatabaseRow): AuditEvent {
  const details = auditDetailsSchema.parse(
    typeof row.details_json === "string" ? JSON.parse(row.details_json) : row.details_json,
  );
  return {
    id: identifierSchema.parse(row.id),
    actorUserId: identifierSchema.nullable().parse(row.actor_user_id),
    requestId: asString(row.request_id, "audit_event.request_id"),
    action: asString(row.action, "audit_event.action"),
    targetType: asString(row.target_type, "audit_event.target_type"),
    targetId: asNullableString(row.target_id, "audit_event.target_id"),
    outcome: auditOutcomeSchema.parse(row.outcome),
    details,
    occurredAt: asString(row.occurred_at, "audit_event.occurred_at"),
  };
}

// @implements-requirement HALL-TR-SCH-030
export function createSecurityRepository({
  postgresClient,
  requestContext,
}: {
  postgresClient: PostgresClient;
  requestContext: RequestContextStore;
}) {
  const administration = postgresClient.administration;
  const request = () => administrationRequest(requestContext);
  const openUser = async (id: string, lockForUpdate = false) =>
    isIdentifier(id)
      ? optionalUser(await administrationCall(() => administration.openUser(request(), id, lockForUpdate)))
      : null;
  return {
    countUsers: () => administrationCall(() => administration.countUsers(request())),
    countActiveAdministrators: () => administrationCall(() => administration.countActiveAdministrators(request())),
    lockAdministratorInvariant: () =>
      administrationCall(() => administration.lockAdministratorInvariant(request())).then(() => undefined),
    async listUsers() {
      return (await administrationCall(() => administration.listUsers(request()))).map(mapUser);
    },
    findUserById: (id: string) => openUser(id),
    lockUserForAuthentication: (id: string) => openUser(id, true),
    async findUserByEmail(email: string) {
      return optionalUser(
        await administrationCall(() => administration.findUserByEmail(request(), email.toLowerCase())),
      );
    },
    async createUser(input: {
      email: string;
      displayName: string;
      passwordHash: string;
      passwordChangeRequired?: boolean;
      roles: ApiRole[];
      contactId: string | null;
    }) {
      return mapUser(
        await administrationCall(() =>
          administration.createUser(request(), { ...input, email: input.email.toLowerCase() }),
        ),
      );
    },
    async bootstrapAdministrator(input: { email: string; displayName: string; passwordHash: string }) {
      return optionalUser(
        await administrationCall(() =>
          administration.bootstrapAdministrator(request(), { ...input, email: input.email.toLowerCase() }),
        ),
      );
    },
    async setRoles(id: string, roles: ApiRole[]) {
      if (!isIdentifier(id)) return null;
      return optionalUser(await administrationCall(() => administration.setUserRoles(request(), id, roles)));
    },
    async updateUser(
      id: string,
      input: { email: string; displayName: string; contactId: string | null; passwordChangeRequired?: boolean },
    ) {
      if (!isIdentifier(id)) return null;
      return optionalUser(
        await administrationCall(() =>
          administration.updateUser(request(), id, { ...input, email: input.email.toLowerCase() }),
        ),
      );
    },
    updatePassword(
      id: string,
      previousHash: string,
      passwordHash: string,
      passwordChangeRequired: boolean | null = false,
    ) {
      return administrationCall(() =>
        administration.replacePassword(request(), id, previousHash, passwordHash, passwordChangeRequired),
      );
    },
    async reactivateUser(id: string, passwordHash: string) {
      if (!isIdentifier(id)) return null;
      return optionalUser(await administrationCall(() => administration.reactivateUser(request(), id, passwordHash)));
    },
    async disableUser(id: string) {
      if (!isIdentifier(id)) return null;
      return optionalUser(await administrationCall(() => administration.disableUser(request(), id)));
    },
    async issuePasswordLink(userId: string, purpose: PasswordLinkPurpose, tokenHash: string, issuedAt: Date) {
      if (!isIdentifier(userId)) return { outcome: "not_found" as const };
      return issuedPasswordLinkSchema.parse(
        await administrationCall(() =>
          administration.issuePasswordLink(request(), userId, purpose, tokenHash, issuedAt.toISOString()),
        ),
      );
    },
    async openPasswordLink(tokenHash: string, openedAt: Date) {
      return openedPasswordLinkSchema.parse(
        await administrationCall(() => administration.openPasswordLink(request(), tokenHash, openedAt.toISOString())),
      );
    },
    async completePasswordLink(tokenHash: string, passwordHash: string, completedAt: Date) {
      return optionalUser(
        await administrationCall(() =>
          administration.completePasswordLink(request(), tokenHash, passwordHash, completedAt.toISOString()),
        ),
      );
    },
    recordAccountMail(
      userId: string,
      mail: { kind: AccountMailKind; outcome: AccountMailOutcome; failureCode: string | null; sentAt: Date },
    ) {
      return administrationCall(() =>
        administration.recordAccountMail(request(), userId, { ...mail, sentAt: mail.sentAt.toISOString() }),
      );
    },
    async accountMailSender() {
      return accountMailSenderSchema.parse(await administrationCall(() => administration.accountMailSender(request())));
    },
    async createSession(userId: string, tokenHash: string, expiresAt: string) {
      const row = await administrationCall(() => administration.createSession(request(), userId, tokenHash, expiresAt));
      return mapSession(row);
    },
    async findSession(tokenHash: string) {
      const row = await administrationCall(() => administration.findSession(request(), tokenHash));
      return row ? mapSession(row) : null;
    },
    async deleteSession(id: string) {
      if (isIdentifier(id)) await administrationCall(() => administration.deleteSession(request(), id));
    },
    async listAuditEvents(limit = 200) {
      return (await administrationCall(() => administration.listAuditEvents(request(), limit))).map(mapAuditEvent);
    },
    async findAuditEvent(id: string) {
      if (!isIdentifier(id)) return null;
      const row = await administrationCall(() => administration.openAuditEvent(request(), id));
      return row ? mapAuditEvent(row) : null;
    },
    recordAuditEvent(input: Omit<AuditEvent, "id" | "occurredAt">) {
      const base = request();
      return administrationCall(() =>
        administration.recordAuditEvent(
          { role: base.role, context: { ...base.context, requestId: input.requestId, actorId: input.actorUserId } },
          input.action,
          { targetType: input.targetType, targetId: input.targetId, outcome: input.outcome, details: input.details },
        ),
      );
    },
  };
}

function mapSession(row: DatabaseRow): StoredSession {
  return {
    id: identifierSchema.parse(row.id),
    userId: identifierSchema.parse(row.user_id),
    expiresAt: asString(row.expires_at, "security_session.expires_at"),
  };
}

export type SecurityRepository = ReturnType<typeof createSecurityRepository>;
