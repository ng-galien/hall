import { type ApiRole, type ApiUser, apiRoleSchema, apiUserStatusSchema } from "@hall/api-contract";
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
    createdAt: asString(row.created_at, "security_user.created_at"),
    updatedAt: asString(row.updated_at, "security_user.updated_at"),
  };
}

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
