import { z } from "zod";

const identifierSchema = z.string().uuid();
const nonEmptyNameSchema = z.string().trim().min(1).max(200);
export const delegationRoleSchema = z.enum(["primary", "alternate"]);
export const councilDelegationSchema = z
  .object({
    id: identifierSchema,
    name: nonEmptyNameSchema,
    description: z.string(),
    archivedAt: z.iso.datetime({ offset: true }).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const saveCouncilDelegationSchema = z
  .object({
    name: nonEmptyNameSchema,
    description: z.string().trim().max(10_000).default(""),
  })
  .strict();

export const delegationMembershipSchema = z
  .object({
    id: identifierSchema,
    delegationId: identifierSchema,
    contactId: identifierSchema,
    role: delegationRoleSchema,
    startedOn: z.iso.date(),
    endedOn: z.iso.date().nullable(),
  })
  .strict();

export const addDelegationMembershipSchema = z
  .object({
    contactId: identifierSchema,
    role: delegationRoleSchema.default("primary"),
    startedOn: z.iso.date(),
  })
  .strict();

export const updateDelegationMembershipSchema = z
  .object({
    role: delegationRoleSchema,
    startedOn: z.iso.date(),
    endedOn: z.iso.date().nullable(),
  })
  .strict()
  .refine((value) => value.endedOn === null || value.endedOn >= value.startedOn, {
    message: "The membership end date cannot precede its start date",
    path: ["endedOn"],
  });

export const endDelegationMembershipSchema = z.object({ endedOn: z.iso.date() }).strict();

export type CouncilDelegation = z.infer<typeof councilDelegationSchema>;
export type SaveCouncilDelegation = z.infer<typeof saveCouncilDelegationSchema>;
export type DelegationMembership = z.infer<typeof delegationMembershipSchema>;
export type AddDelegationMembership = z.infer<typeof addDelegationMembershipSchema>;
export type UpdateDelegationMembership = z.infer<typeof updateDelegationMembershipSchema>;
