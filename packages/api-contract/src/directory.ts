import { z } from "zod";

const identifierSchema = z.string().uuid();
const nonEmptyNameSchema = z.string().trim().min(1).max(160);
const nullableBoundedTextSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z.string().trim().min(1).max(160).nullable(),
);

export const councilRoles = ["mayor", "deputyMayor", "councillor"] as const;
export const councilRoleSchema = z.enum(councilRoles);
export const committeeRoles = ["chair", "viceChair", "member"] as const;
export const committeeRoleSchema = z.enum(committeeRoles);

export const contactSchema = z
  .object({
    id: identifierSchema,
    firstName: nonEmptyNameSchema,
    lastName: nonEmptyNameSchema,
    organizationName: z.string().nullable(),
    jobTitle: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    notes: z.string(),
    archivedAt: z.iso.datetime({ offset: true }).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const saveContactSchema = z
  .object({
    firstName: nonEmptyNameSchema,
    lastName: nonEmptyNameSchema,
    organizationName: nullableBoundedTextSchema.default(null),
    jobTitle: nullableBoundedTextSchema.default(null),
    email: z.preprocess(
      (value) => (value === "" ? null : value),
      z.string().trim().toLowerCase().email().nullable().default(null),
    ),
    phone: z.preprocess(
      (value) => (value === "" ? null : value),
      z.string().trim().min(3).max(40).nullable().default(null),
    ),
    notes: z.string().trim().max(10_000).default(""),
  })
  .strict();

export const councilTermSchema = z
  .object({
    id: identifierSchema,
    expectedMemberCount: z.number().int().positive(),
    startedOn: z.iso.date(),
  })
  .strict();

export const configureCouncilTermSchema = z
  .object({
    expectedMemberCount: z.number().int().positive(),
  })
  .strict();

export const councilMemberSchema = z
  .object({
    id: identifierSchema,
    contactId: identifierSchema,
    councilTermId: identifierSchema,
    rank: z.number().int().nonnegative().nullable(),
    role: councilRoleSchema,
    active: z.boolean(),
    termStartedOn: z.iso.date(),
    termEndedOn: z.iso.date().nullable(),
  })
  .strict();

export const createCouncilMemberSchema = z
  .object({
    contactId: identifierSchema,
    role: councilRoleSchema,
    rank: z.number().int().nonnegative().nullable().optional(),
    termStartedOn: z.iso.date(),
  })
  .strict();

export const updateCouncilMemberSchema = z
  .object({
    role: councilRoleSchema,
    rank: z.number().int().nonnegative().nullable().optional(),
    termStartedOn: z.iso.date(),
    termEndedOn: z.iso.date().nullable(),
  })
  .strict()
  .refine((value) => value.termEndedOn === null || value.termEndedOn >= value.termStartedOn, {
    message: "The term end date cannot precede its start date",
    path: ["termEndedOn"],
  });

export const councilCommitteeSchema = z
  .object({
    id: identifierSchema,
    name: nonEmptyNameSchema,
    description: z.string(),
    archivedAt: z.iso.datetime({ offset: true }).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const saveCouncilCommitteeSchema = z
  .object({
    name: nonEmptyNameSchema,
    description: z.string().trim().max(10_000).default(""),
  })
  .strict();

export const committeeMembershipSchema = z
  .object({
    id: identifierSchema,
    committeeId: identifierSchema,
    contactId: identifierSchema,
    role: committeeRoleSchema,
    startedOn: z.iso.date(),
    endedOn: z.iso.date().nullable(),
  })
  .strict();

export const addCommitteeMembershipSchema = z
  .object({
    contactId: identifierSchema,
    role: committeeRoleSchema.default("member"),
    startedOn: z.iso.date(),
  })
  .strict();

export const updateCommitteeMembershipSchema = z
  .object({
    role: committeeRoleSchema,
    startedOn: z.iso.date(),
    endedOn: z.iso.date().nullable(),
  })
  .strict()
  .refine((value) => value.endedOn === null || value.endedOn >= value.startedOn, {
    message: "The membership end date cannot precede its start date",
    path: ["endedOn"],
  });

export const endCommitteeMembershipSchema = z.object({ endedOn: z.iso.date() }).strict();

export type Contact = z.infer<typeof contactSchema>;
export type SaveContact = z.infer<typeof saveContactSchema>;
export type CouncilTerm = z.infer<typeof councilTermSchema>;
export type ConfigureCouncilTerm = z.infer<typeof configureCouncilTermSchema>;
export type CouncilRole = z.infer<typeof councilRoleSchema>;
export type CouncilMember = z.infer<typeof councilMemberSchema>;
export type CreateCouncilMember = z.infer<typeof createCouncilMemberSchema>;
export type UpdateCouncilMember = z.infer<typeof updateCouncilMemberSchema>;
export type CouncilCommittee = z.infer<typeof councilCommitteeSchema>;
export type SaveCouncilCommittee = z.infer<typeof saveCouncilCommitteeSchema>;
export type CommitteeRole = z.infer<typeof committeeRoleSchema>;
export type CommitteeMembership = z.infer<typeof committeeMembershipSchema>;
export type AddCommitteeMembership = z.infer<typeof addCommitteeMembershipSchema>;
export type UpdateCommitteeMembership = z.infer<typeof updateCommitteeMembershipSchema>;

export {
  type AddDelegationMembership,
  addDelegationMembershipSchema,
  type CouncilDelegation,
  councilDelegationSchema,
  type DelegationMembership,
  delegationMembershipSchema,
  delegationRoleSchema,
  endDelegationMembershipSchema,
  type SaveCouncilDelegation,
  saveCouncilDelegationSchema,
  type UpdateDelegationMembership,
  updateDelegationMembershipSchema,
} from "@hall/contracts";
