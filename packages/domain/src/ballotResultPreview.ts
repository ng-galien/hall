import { z } from "zod";
import { meetingQuorumFactsSchema } from "./meetingConduct.js";

const id = z.uuid();
const count = z.number().int().nonnegative();
export const ordinaryBallotTotalsSchema = z
  .object({
    approve: count,
    reject: count,
    abstain: count,
    blank: count,
    invalid: count,
    nonParticipation: count,
  })
  .strict();
const candidateBase = {
  procedure: z.literal("ordinaryMajority"),
  participantAttendanceIds: z.array(id).min(1),
  chairmanAttendanceId: id,
};
export const ordinaryBallotCandidateSchema = z.discriminatedUnion("mode", [
  z
    .object({
      ...candidateBase,
      mode: z.literal("public"),
      votes: z.array(z.object({ meetingAttendanceId: id, choice: z.enum(["approve", "reject", "abstain"]) }).strict()),
      nonParticipations: z
        .array(z.object({ meetingAttendanceId: id, reason: z.enum(["declined", "departed"]) }).strict())
        .default([]),
    })
    .strict(),
  z
    .object({
      ...candidateBase,
      mode: z.literal("secret"),
      totals: ordinaryBallotTotalsSchema.extend({
        blank: count.default(0),
        invalid: count.default(0),
        nonParticipation: count.default(0),
      }),
    })
    .strict(),
]);
export const createBallotResultPreviewSchema = z
  .object({ agendaItemId: id, candidate: ordinaryBallotCandidateSchema })
  .strict();
export const ballotResultPreviewSchema = z
  .object({
    id,
    agendaItemId: id,
    canConfirm: z.boolean(),
    revision: z.number().int().positive(),
    candidate: ordinaryBallotCandidateSchema,
    calculation: z
      .object({
        tieBreakApplied: z.boolean(),
        result: z.enum(["approve", "reject"]),
        totals: ordinaryBallotTotalsSchema,
        expressedCount: count,
        participantCount: z.number().int().positive(),
      })
      .strict(),
    quorum: meetingQuorumFactsSchema,
    createdAt: z.iso.datetime({ offset: true }),
    createdBy: z.string().min(1),
  })
  .strict();
export type CreateBallotResultPreview = z.input<typeof createBallotResultPreviewSchema>;
export type BallotResultPreview = z.infer<typeof ballotResultPreviewSchema>;
