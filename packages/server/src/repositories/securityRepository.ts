import { randomUUID } from "node:crypto";
import type { ApiRole, ApiUser } from "@mairie/api-contract";
import type { SqliteExecutor } from "../infrastructure/sqlite/executor.js";

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  status: ApiUser["status"];
  council_member_id: string | null;
  created_at: string;
  updated_at: string;
}

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

function rolesFor(database: SqliteExecutor["database"], userId: string): ApiRole[] {
  return database
    .prepare("SELECT role FROM user_roles WHERE user_id = ? ORDER BY role")
    .all(userId)
    .map((row) => String(row.role) as ApiRole);
}

function mapUser(database: SqliteExecutor["database"], row: UserRow): StoredUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    status: row.status,
    councilMemberId: row.council_member_id,
    roles: rolesFor(database, row.id),
    permissions: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSecurityRepository({ sqliteExecutor }: { sqliteExecutor: SqliteExecutor }) {
  const mapAuditEvent = (row: Record<string, unknown>): AuditEvent => ({
    id: String(row.id),
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    requestId: String(row.request_id),
    action: String(row.action),
    targetType: String(row.target_type),
    targetId: row.target_id ? String(row.target_id) : null,
    outcome: String(row.outcome) as AuditEvent["outcome"],
    details: JSON.parse(String(row.details_json)) as Record<string, unknown>,
    occurredAt: String(row.occurred_at),
  });
  const findUser = (clause: string, value: string) =>
    sqliteExecutor.run((database) => {
      const row = database.prepare(`SELECT * FROM users WHERE ${clause}`).get(value) as UserRow | undefined;
      return row ? mapUser(database, row) : null;
    });

  return {
    countUsers: () =>
      sqliteExecutor.run((database) =>
        Number(database.prepare("SELECT COUNT(*) AS count FROM users").get()?.count ?? 0),
      ),
    countActiveAdministrators: () =>
      sqliteExecutor.run((database) =>
        Number(
          database
            .prepare(
              `SELECT COUNT(*) AS count
               FROM users JOIN user_roles ON user_roles.user_id = users.id
               WHERE users.status = 'active' AND user_roles.role = 'administrator'`,
            )
            .get()?.count ?? 0,
        ),
      ),
    listUsers: () =>
      sqliteExecutor.run((database) =>
        (database.prepare("SELECT * FROM users ORDER BY display_name, email").all() as unknown as UserRow[]).map(
          (row) => mapUser(database, row),
        ),
      ),
    findUserById: (id: string) => findUser("id = ?", id),
    findUserByEmail: (email: string) => findUser("email = ?", email.toLowerCase()),
    createUser(input: {
      email: string;
      displayName: string;
      passwordHash: string;
      roles: ApiRole[];
      councilMemberId: string | null;
    }) {
      return sqliteExecutor.run((database) => {
        const id = randomUUID();
        const now = new Date().toISOString();
        database
          .prepare(
            `INSERT INTO users
              (id, email, display_name, password_hash, council_member_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(id, input.email.toLowerCase(), input.displayName, input.passwordHash, input.councilMemberId, now, now);
        const insertRole = database.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)");
        for (const role of input.roles) insertRole.run(id, role);
        return mapUser(database, database.prepare("SELECT * FROM users WHERE id = ?").get(id) as unknown as UserRow);
      });
    },
    setRoles(id: string, roles: ApiRole[]) {
      return sqliteExecutor.run((database) => {
        database.prepare("DELETE FROM user_roles WHERE user_id = ?").run(id);
        const insertRole = database.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)");
        for (const role of roles) insertRole.run(id, role);
        const row = database.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
        return row ? mapUser(database, row) : null;
      });
    },
    disableUser(id: string) {
      return sqliteExecutor.run((database) => {
        const now = new Date().toISOString();
        const result = database
          .prepare("UPDATE users SET status = 'disabled', updated_at = ? WHERE id = ?")
          .run(now, id);
        database.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
        if (result.changes === 0) return null;
        return mapUser(database, database.prepare("SELECT * FROM users WHERE id = ?").get(id) as unknown as UserRow);
      });
    },
    createSession(userId: string, tokenHash: string, expiresAt: string) {
      return sqliteExecutor.run((database) => {
        const id = randomUUID();
        database
          .prepare("INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
          .run(id, userId, tokenHash, new Date().toISOString(), expiresAt);
        return { id, userId, expiresAt } satisfies StoredSession;
      });
    },
    findSession(tokenHash: string) {
      return sqliteExecutor.run((database) => {
        const row = database
          .prepare("SELECT id, user_id, expires_at FROM sessions WHERE token_hash = ? AND expires_at > ?")
          .get(tokenHash, new Date().toISOString()) as { id: string; user_id: string; expires_at: string } | undefined;
        return row ? ({ id: row.id, userId: row.user_id, expiresAt: row.expires_at } satisfies StoredSession) : null;
      });
    },
    deleteSession(id: string) {
      return sqliteExecutor.run((database) => {
        database.prepare("DELETE FROM sessions WHERE id = ?").run(id);
      });
    },
    listAuditEvents(limit = 200) {
      return sqliteExecutor.run((database) =>
        database
          .prepare("SELECT * FROM audit_events ORDER BY occurred_at DESC LIMIT ?")
          .all(limit)
          .map((row) => mapAuditEvent(row)),
      );
    },
    findAuditEvent(id: string) {
      return sqliteExecutor.run((database) => {
        const row = database.prepare("SELECT * FROM audit_events WHERE id = ?").get(id);
        return row ? mapAuditEvent(row) : null;
      });
    },
    recordAuditEvent(input: Omit<AuditEvent, "id" | "occurredAt">) {
      return sqliteExecutor.run((database) => {
        const storedActor = input.actorUserId
          ? database.prepare("SELECT id FROM users WHERE id = ?").get(input.actorUserId)
          : undefined;
        database
          .prepare(
            `INSERT INTO audit_events
              (id, actor_user_id, request_id, action, target_type, target_id, outcome, details_json, occurred_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            randomUUID(),
            storedActor ? input.actorUserId : null,
            input.requestId,
            input.action,
            input.targetType,
            input.targetId,
            input.outcome,
            JSON.stringify(input.details),
            new Date().toISOString(),
          );
      });
    },
  };
}

export type SecurityRepository = ReturnType<typeof createSecurityRepository>;
