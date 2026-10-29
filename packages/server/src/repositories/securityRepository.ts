import { randomUUID } from "node:crypto";
import { type ApiRole, type ApiUser, apiRoleSchema, apiUserStatusSchema } from "@hall/api-contract";
import { identifierSchema } from "@hall/domain";
import { z } from "zod";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import { asInteger, asNullableString, asString, type DatabaseRow, mapSequential } from "./row.js";

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

async function mapUser(sqlExecutor: SqlExecutor, row: DatabaseRow): Promise<StoredUser> {
  const id = identifierSchema.parse(row.id);
  const roles = (await sqlExecutor.all("security.rolesForUser", { userId: id })).map((role) =>
    apiRoleSchema.parse(role.role),
  );
  return {
    id,
    email: asString(row.email, "security_user.email"),
    displayName: asString(row.display_name, "security_user.display_name"),
    passwordHash: asString(row.password_hash, "security_user.password_hash"),
    status: apiUserStatusSchema.parse(row.status),
    contactId: identifierSchema.nullable().parse(row.contact_id),
    roles,
    permissions: [],
    createdAt: asString(row.created_at, "security_user.created_at"),
    updatedAt: asString(row.updated_at, "security_user.updated_at"),
  };
}

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

export function createSecurityRepository({ sqlExecutor }: { sqlExecutor: SqlExecutor }) {
  const findUser = async (
    name: "security.findUserById" | "security.findUserByEmail" | "security.lockUserForAuthentication",
    value: string,
  ) => {
    const row = await sqlExecutor.get(name, { value });
    return row ? mapUser(sqlExecutor, row) : null;
  };
  return {
    countUsers: async () => asInteger((await sqlExecutor.get("security.countUsers"))?.count, "security_user.count"),
    countActiveAdministrators: async () =>
      asInteger((await sqlExecutor.get("security.countActiveAdministrators"))?.count, "security_user.admin_count"),
    lockAdministratorInvariant: () => sqlExecutor.get("security.lockAdministratorInvariant").then(() => undefined),
    async listUsers() {
      return mapSequential(await sqlExecutor.all("security.listUsers"), (row) => mapUser(sqlExecutor, row));
    },
    findUserById: (id: string) => findUser("security.findUserById", id),
    lockUserForAuthentication: (id: string) => findUser("security.lockUserForAuthentication", id),
    findUserByEmail: (email: string) => findUser("security.findUserByEmail", email.toLowerCase()),
    createUser(input: {
      email: string;
      displayName: string;
      passwordHash: string;
      roles: ApiRole[];
      contactId: string | null;
    }) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        const now = new Date().toISOString();
        await sqlExecutor.run("security.insertUser", {
          id,
          email: input.email.toLowerCase(),
          displayName: input.displayName,
          passwordHash: input.passwordHash,
          contactId: input.contactId,
          createdAt: now,
          updatedAt: now,
        });
        for (const role of input.roles) await sqlExecutor.run("security.insertRole", { userId: id, role });
        return mapUser(sqlExecutor, (await sqlExecutor.get("security.findUserById", { value: id }))!);
      });
    },
    setRoles(id: string, roles: ApiRole[]) {
      return sqlExecutor.execute(async () => {
        await sqlExecutor.run("security.deleteRoles", { userId: id });
        for (const role of roles) await sqlExecutor.run("security.insertRole", { userId: id, role });
        const row = await sqlExecutor.get("security.findUserById", { value: id });
        return row ? mapUser(sqlExecutor, row) : null;
      });
    },
    async updateUser(id: string, input: { email: string; displayName: string; contactId: string | null }) {
      await sqlExecutor.run("security.updateUser", {
        id,
        ...input,
        email: input.email.toLowerCase(),
        updatedAt: new Date().toISOString(),
      });
      const row = await sqlExecutor.get("security.findUserById", { value: id });
      return row ? mapUser(sqlExecutor, row) : null;
    },
    async updatePassword(id: string, previousHash: string, passwordHash: string) {
      const result = await sqlExecutor.run("security.updatePassword", {
        id,
        previousHash,
        passwordHash,
        updatedAt: new Date().toISOString(),
      });
      if (result.changes !== 0) await sqlExecutor.run("security.deleteSessionsForUser", { userId: id });
      return result.changes !== 0;
    },
    reactivateUser(id: string, passwordHash: string) {
      return sqlExecutor.execute(async () => {
        const result = await sqlExecutor.run("security.reactivateUser", {
          id,
          passwordHash,
          updatedAt: new Date().toISOString(),
        });
        if (result.changes === 0) return null;
        return mapUser(sqlExecutor, (await sqlExecutor.get("security.findUserById", { value: id }))!);
      });
    },
    disableUser(id: string) {
      return sqlExecutor.execute(async () => {
        const result = await sqlExecutor.run("security.disableUser", { id, updatedAt: new Date().toISOString() });
        await sqlExecutor.run("security.deleteSessionsForUser", { userId: id });
        if (result.changes === 0) return null;
        return mapUser(sqlExecutor, (await sqlExecutor.get("security.findUserById", { value: id }))!);
      });
    },
    createSession(userId: string, tokenHash: string, expiresAt: string) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        await sqlExecutor.run("security.insertSession", {
          id,
          userId,
          tokenHash,
          createdAt: new Date().toISOString(),
          expiresAt,
        });
        return { id, userId, expiresAt } satisfies StoredSession;
      });
    },
    async findSession(tokenHash: string) {
      const row = await sqlExecutor.get("security.findSession", { tokenHash, now: new Date().toISOString() });
      return row
        ? ({
            id: identifierSchema.parse(row.id),
            userId: identifierSchema.parse(row.user_id),
            expiresAt: asString(row.expires_at, "security_session.expires_at"),
          } satisfies StoredSession)
        : null;
    },
    deleteSession(id: string) {
      return sqlExecutor.run("security.deleteSession", { id }).then(() => undefined);
    },
    async listAuditEvents(limit = 200) {
      return (await sqlExecutor.all("security.listAuditEvents", { limit })).map(mapAuditEvent);
    },
    async findAuditEvent(id: string) {
      const row = await sqlExecutor.get("security.findAuditEvent", { id });
      return row ? mapAuditEvent(row) : null;
    },
    recordAuditEvent(input: Omit<AuditEvent, "id" | "occurredAt">) {
      return sqlExecutor.execute(async () => {
        const actor = input.actorUserId
          ? await sqlExecutor.get("security.actorExists", { actorUserId: input.actorUserId })
          : undefined;
        await sqlExecutor.run("security.insertAuditEvent", {
          id: randomUUID(),
          actorUserId: actor ? input.actorUserId : null,
          requestId: input.requestId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          outcome: input.outcome,
          detailsJson: JSON.stringify(input.details),
          occurredAt: new Date().toISOString(),
        });
      });
    },
  };
}

export type SecurityRepository = ReturnType<typeof createSecurityRepository>;
