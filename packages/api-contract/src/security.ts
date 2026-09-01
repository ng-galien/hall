import { z } from "zod";

export const apiRoles = ["administrator", "clerk", "contributor", "meetingConductor", "reader"] as const;
export type ApiRole = (typeof apiRoles)[number];
export const apiRoleSchema = z.enum(apiRoles);
const apiRoleListSchema = z
  .array(apiRoleSchema)
  .min(1)
  .refine((roles) => new Set(roles).size === roles.length, "Roles must be unique");

export const apiUserStatuses = ["active", "disabled"] as const;
export type ApiUserStatus = (typeof apiUserStatuses)[number];
export const apiUserStatusSchema = z.enum(apiUserStatuses);

export const apiPermissions = [
  "users.manage",
  "settings.manage",
  "members.manage",
  "workspace.read",
  "workspace.write",
  "meetings.read",
  "meetings.prepare",
  "meetings.conduct",
  "audit.read",
] as const;
export type ApiPermission = (typeof apiPermissions)[number];

export interface ApiPrincipal {
  id: string;
  displayName: string;
  roles: ApiRole[];
  permissions: ApiPermission[];
  councilMemberId: string | null;
}

export interface ApiUser extends ApiPrincipal {
  email: string;
  status: ApiUserStatus;
  protectedFromDisable?: boolean;
  createdAt: string;
  updatedAt: string;
}

const passwordSchema = z.string().min(12).max(256);

export const bootstrapUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  displayName: z.string().trim().min(1).max(160),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(256),
});

export const createUserSchema = bootstrapUserSchema.extend({
  roles: apiRoleListSchema,
  councilMemberId: z.string().uuid().nullable().default(null),
});

export const assignUserRolesSchema = z.object({
  roles: apiRoleListSchema,
});
