import { z } from "zod";

// One closed legal qualification. It is declared explicitly, never inferred.
export const recusalLegalBasisSchema = z.enum(["personalInterest", "designatedRepresentativeConflict"]);
export type RecusalLegalBasis = z.infer<typeof recusalLegalBasisSchema>;
export const recusalLegalBases = recusalLegalBasisSchema.options;

export const recordAgendaItemRecusalSchema = z
  .object({
    councilMemberId: z.uuid(),
    legalBasis: recusalLegalBasisSchema,
    declaredAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type RecordAgendaItemRecusal = z.infer<typeof recordAgendaItemRecusalSchema>;

export const agendaItemRecusalSchema = recordAgendaItemRecusalSchema.extend({
  id: z.uuid(),
  agendaItemId: z.uuid(),
  recordedAt: z.iso.datetime({ offset: true }),
  recordedBy: z.string().min(1),
  memberName: z.string(),
});
export type AgendaItemRecusal = z.infer<typeof agendaItemRecusalSchema>;

// These are impacts on declarations, not a legal membership/quorum observation.
export const agendaItemRecusalStateSchema = z
  .object({
    recusals: z.array(agendaItemRecusalSchema),
    eligibleParticipantAttendanceIds: z.array(z.uuid()),
    departedParticipantAttendanceIds: z.array(z.uuid()),
    quorumImpact: z
      .object({
        excludedMemberIds: z.array(z.uuid()),
        denominatorReduction: z.number().int().nonnegative(),
        eligibleDeclaredPresentMemberIds: z.array(z.uuid()),
      })
      .strict(),
    canRecordRecusal: z.boolean(),
  })
  .strict();

export const ballotChairBasisSchema = z.enum([
  "meetingChair",
  "statutoryReplacement",
  "financialStatementElection",
  "councilDesignation",
]);
export type BallotChairBasis = z.infer<typeof ballotChairBasisSchema>;
export const agendaItemPresidencyBasisSchema = z.enum(["financialStatementElection", "councilDesignation"]);
export type AgendaItemPresidencyBasis = z.infer<typeof agendaItemPresidencyBasisSchema>;
// The ballot chair is determined by the meeting and only displayed.
export const agendaItemBallotStateSchema = z
  .object({
    ballotChair: z
      .object({
        councilMemberId: z.uuid().nullable(),
        basis: ballotChairBasisSchema.nullable(),
        meetingAttendanceId: z.uuid().nullable(),
        physicallyPresent: z.boolean(),
      })
      .strict(),
    presidency: z
      .object({
        id: z.uuid(),
        basis: agendaItemPresidencyBasisSchema,
        councilMemberId: z.uuid(),
        memberName: z.string(),
        observedAt: z.iso.datetime({ offset: true }),
      })
      .strict()
      .nullable(),
    presidencyOptions: z
      .object({ financialStatementElection: z.array(z.uuid()), councilDesignation: z.array(z.uuid()) })
      .strict(),
  })
  .strict();
export type AgendaItemBallotState = z.infer<typeof agendaItemBallotStateSchema>;
export const recordAgendaItemPresidencySchema = z
  .object({
    councilMemberId: z.uuid(),
    basis: agendaItemPresidencyBasisSchema,
    observedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type RecordAgendaItemPresidency = z.infer<typeof recordAgendaItemPresidencySchema>;
