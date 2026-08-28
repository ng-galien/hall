import { randomUUID } from "node:crypto";
import type { ApiRole, ApiUser } from "@hall/api-contract";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import { type DatabaseRow, mapSequential } from "./row.js";

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
  outcome: "succeeded" | "denied" | "failed";
  details: Record<string, unknown>;
  occurredAt: string;
}

async function mapUser(sqlExecutor: SqlExecutor, row: DatabaseRow): Promise<StoredUser> {
  const roles = (await sqlExecutor.all("security.rolesForUser", { userId: String(row.id) })).map(
    (role) => String(role.role) as ApiRole,
  );
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: String(row.display_name),
    passwordHash: String(row.password_hash),
    status: row.status as ApiUser["status"],
    councilMemberId: row.council_member_id ? String(row.council_member_id) : null,
    roles,
    permissions: [],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapAuditEvent(row: DatabaseRow): AuditEvent {
  const details = typeof row.details_json === "string" ? JSON.parse(row.details_json) : row.details_json;
  return {
    id: String(row.id),
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    requestId: String(row.request_id),
    action: String(row.action),
    targetType: String(row.target_type),
    targetId: row.target_id ? String(row.target_id) : null,
    outcome: String(row.outcome) as AuditEvent["outcome"],
    details: details as Record<string, unknown>,
    occurredAt: String(row.occurred_at),
  };
}

export function createSecurityRepository({ sqlExecutor }: { sqlExecutor: SqlExecutor }) {
  const findUser = async (name: "security.findUserById" | "security.findUserByEmail", value: string) => {
    const row = await sqlExecutor.get(name, { value });
    return row ? mapUser(sqlExecutor, row) : null;
  };
  return {
    countUsers: async () => Number((await sqlExecutor.get("security.countUsers"))?.count ?? 0),
    countActiveAdministrators: async () =>
      Number((await sqlExecutor.get("security.countActiveAdministrators"))?.count ?? 0),
    lockAdministratorInvariant: () => sqlExecutor.get("security.lockAdministratorInvariant").then(() => undefined),
    async listUsers() {
      return mapSequential(await sqlExecutor.all("security.listUsers"), (row) => mapUser(sqlExecutor, row));
    },
    findUserById: (id: string) => findUser("security.findUserById", id),
    findUserByEmail: (email: string) => findUser("security.findUserByEmail", email.toLowerCase()),
    createUser(input: {
      email: string;
      displayName: string;
      passwordHash: string;
      roles: ApiRole[];
      councilMemberId: string | null;
    }) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        const now = new Date().toISOString();
        await sqlExecutor.run("security.insertUser", {
          id,
          email: input.email.toLowerCase(),
          displayName: input.displayName,
          passwordHash: input.passwordHash,
          councilMemberId: input.councilMemberId,
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
            id: String(row.id),
            userId: String(row.user_id),
            expiresAt: String(row.expires_at),
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
