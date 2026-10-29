import { z } from "zod";

export const databaseRoles = ["hall_api_anonymous", "hall_api_authenticated", "hall_api_worker"] as const;

const databaseRoleSchema = z.enum(databaseRoles);

export type DatabaseRole = z.infer<typeof databaseRoleSchema>;

export type PostgresCallContext = Readonly<{
  requestId: string;
  actorId: string | null;
  action: string;
  contactId: string | null;
  /** The roles of the account; PostgreSQL applies the role matrix and its conditions. */
  roles?: readonly string[];
}>;

export type PostgresRequest = Readonly<{
  role: DatabaseRole;
  context: Readonly<Omit<PostgresCallContext, "action">>;
}>;

export function parseDatabaseRole(value: unknown): DatabaseRole {
  return databaseRoleSchema.parse(value);
}
