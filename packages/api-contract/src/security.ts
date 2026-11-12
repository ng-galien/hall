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
  passwordChangeRequired: boolean;
}

export const passwordLinkPurposes = ["invitation", "recovery"] as const;
export type PasswordLinkPurpose = (typeof passwordLinkPurposes)[number];
export const passwordLinkPurposeSchema = z.enum(passwordLinkPurposes);

export const accountMailKinds = [...passwordLinkPurposes, "password-changed"] as const;
export type AccountMailKind = (typeof accountMailKinds)[number];
export const accountMailKindSchema = z.enum(accountMailKinds);
export const accountMailOutcomes = ["sent", "failed", "unknown"] as const;
export type AccountMailOutcome = (typeof accountMailOutcomes)[number];
export const accountMailOutcomeSchema = z.enum(accountMailOutcomes);

/** The latest account email Hall submitted for an account; it never carries a link or a password. */
export interface ApiAccountMail {
  kind: AccountMailKind;
  outcome: AccountMailOutcome;
  sentAt: string;
}

export interface ApiUser extends ApiPrincipal {
  email: string;
  status: ApiUserStatus;
  protectedFromDisable?: boolean;
  accountMail: ApiAccountMail | null;
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

/** Without a password, Hall sends the invitation to choose one to the address of the account. */
export const createUserSchema = bootstrapUserSchema.extend({
  password: passwordSchema.optional(),
  roles: apiRoleListSchema,
  passwordChangeRequired: z.boolean().default(false),
  contactId: z.string().uuid().nullable().default(null),
});

export const assignUserRolesSchema = z.object({
  roles: apiRoleListSchema,
});

export const updateUserSchema = bootstrapUserSchema
  .pick({ email: true, displayName: true })
  .extend({
    contactId: z.string().uuid().nullable(),
    passwordChangeRequired: z.boolean().optional(),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(256).optional(),
    newPassword: passwordSchema,
  })
  .strict();

export const resetPasswordSchema = z
  .object({ newPassword: passwordSchema, passwordChangeRequired: z.boolean().optional() })
  .strict();

export const requestPasswordLinkSchema = z.object({ email: z.string().trim().toLowerCase().email() }).strict();

const passwordLinkTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/)
  .describe("The secret of a password link, as received in its address");

export const openPasswordLinkSchema = z.object({ token: passwordLinkTokenSchema }).strict();

export const completePasswordLinkSchema = z
  .object({ token: passwordLinkTokenSchema, newPassword: passwordSchema })
  .strict();

/** What the holder of a usable link sees before choosing a password. */
export interface ApiPasswordLink {
  purpose: PasswordLinkPurpose;
  email: string;
}

export const sendPasswordLinkSchema = z.object({ purpose: passwordLinkPurposeSchema }).strict();
