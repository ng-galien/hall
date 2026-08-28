import { z } from "zod";

export const apiRoles = ["administrator", "clerk", "contributor", "meetingConductor", "reader"] as const;
export type ApiRole = (typeof apiRoles)[number];

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
  status: "active" | "disabled";
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
  roles: z.array(z.enum(apiRoles)).min(1),
  councilMemberId: z.string().uuid().nullable().default(null),
});

export const assignUserRolesSchema = z.object({
  roles: z.array(z.enum(apiRoles)).min(1),
});
