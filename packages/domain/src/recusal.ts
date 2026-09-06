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
