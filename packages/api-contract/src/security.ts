import { authorizationRoleIdSchema } from "@hall/contracts";
import { z } from "zod";

export type {
  AuthorizationCondition,
  AuthorizationConfiguration,
  AuthorizationGrant,
  AuthorizationRole,
  AuthorizationRoleInput,
  AuthorizationRoleOption,
} from "@hall/contracts";
export {
  authorizationConditionSchema,
  authorizationConditions,
  authorizationConfigurationSchema,
  authorizationRoleInputSchema,
  authorizationRoleOptionSchema,
  authorizationRoleSchema,
} from "@hall/contracts";

export const apiRoles = ["administrator", "clerk", "contributor", "councillor"] as const;
export type ApiRole = string;
export const apiRoleSchema = authorizationRoleIdSchema;
const apiRoleListSchema = z
  .array(apiRoleSchema)
  .min(1)
  .refine((roles) => new Set(roles).size === roles.length, "Roles must be unique");

export const apiUserStatuses = ["active", "disabled"] as const;
export type ApiUserStatus = (typeof apiUserStatuses)[number];
export const apiUserStatusSchema = z.enum(apiUserStatuses);

export interface ApiPrincipal {
  id: string;
  displayName: string;
  roles: ApiRole[];
  contactId: string | null;
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
  contactId: z.string().uuid().nullable().default(null),
});

export const assignUserRolesSchema = z.object({
  roles: apiRoleListSchema,
});

export const updateUserSchema = bootstrapUserSchema
  .pick({ email: true, displayName: true })
  .extend({
    contactId: z.string().uuid().nullable(),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: passwordSchema,
  })
  .strict();

export const resetPasswordSchema = z.object({ newPassword: passwordSchema }).strict();
