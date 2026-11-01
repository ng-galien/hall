import { z } from "zod";

export const authorizationRoleIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9-]*$/);
export const authorizationConditions = ["always", "meetingOfficer", "ownPersonalWorkspace"] as const;
export const authorizationConditionSchema = z.enum(authorizationConditions);
export const authorizationGrantSchema = z
  .object({
    access: z.string().min(1),
    condition: authorizationConditionSchema,
  })
  .strict();
export const authorizationRoleSchema = z.object({
  id: authorizationRoleIdSchema,
  name: z.string().trim().min(1).max(120),
  builtIn: z.boolean(),
  revision: z.number().int().positive(),
  grants: z.array(authorizationGrantSchema),
});
export const authorizationRoleInputSchema = authorizationRoleSchema
  .pick({ name: true, grants: true })
  .extend({
    revision: z.number().int().nonnegative(),
  })
  .strict()
  .refine((input) => new Set(input.grants.map((grant) => grant.access)).size === input.grants.length, {
    message: "Each access has one condition per role",
  });
export const authorizationRoleOptionSchema = authorizationRoleSchema
  .pick({ id: true, name: true, builtIn: true })
  .extend({ requiresActiveMember: z.boolean() });
export const authorizationAccessSchema = z.object({
  access: z.string(),
  resource: z.string(),
  operation: z.string(),
  conditions: z.array(authorizationConditionSchema),
  configurable: z.boolean(),
});
export const authorizationConfigurationSchema = z.object({
  roles: z.array(authorizationRoleSchema),
  accesses: z.array(authorizationAccessSchema),
});
export type AuthorizationCondition = z.infer<typeof authorizationConditionSchema>;
export type AuthorizationGrant = z.infer<typeof authorizationGrantSchema>;
export type AuthorizationRole = z.infer<typeof authorizationRoleSchema>;
export type AuthorizationRoleInput = z.infer<typeof authorizationRoleInputSchema>;
export type AuthorizationRoleOption = z.infer<typeof authorizationRoleOptionSchema>;
export type AuthorizationConfiguration = z.infer<typeof authorizationConfigurationSchema>;
