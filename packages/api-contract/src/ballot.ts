import { z } from "zod";
import { resourceIdSchema } from "./resources.js";

const timestampSchema = z.iso.datetime({ offset: true });

export const ballotModeSchema = z.enum(["public", "secret"]);
export const publicVoteChoiceSchema = z.enum(["approve", "reject", "abstain"]);
export const voteChoiceSchema = z.enum(["approve", "reject", "abstain", "blank", "invalid"]);
export const ballotResultSchema = z.enum(["approve", "reject"]);

export const ballotSchema = z
  .object({
    id: resourceIdSchema,
    agendaItemId: resourceIdSchema,
    mode: ballotModeSchema,
    chairmanParticipationId: resourceIdSchema,
    resultPreviewId: resourceIdSchema.nullable(),
    completedAt: timestampSchema.nullable(),
    result: ballotResultSchema.nullable(),
  })
  .strict();

export const ballotParticipationSchema = z
  .object({
    id: resourceIdSchema,
    ballotId: resourceIdSchema,
    meetingAttendanceId: resourceIdSchema,
    councilMemberId: resourceIdSchema,
  })
  .strict();

export const ballotVoteSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("public"),
      ballotId: resourceIdSchema,
      choice: publicVoteChoiceSchema,
      ballotParticipationId: resourceIdSchema,
      count: z.literal(1),
    })
    .strict(),
  z
    .object({
      mode: z.literal("secret"),
      ballotId: resourceIdSchema,
      choice: voteChoiceSchema,
      ballotParticipationId: z.null(),
      count: z.number().int().positive(),
    })
    .strict(),
]);

export type BallotMode = z.infer<typeof ballotModeSchema>;
export type VoteChoice = z.infer<typeof voteChoiceSchema>;
export type BallotResult = z.infer<typeof ballotResultSchema>;
export type Ballot = z.infer<typeof ballotSchema>;
export type BallotParticipation = z.infer<typeof ballotParticipationSchema>;
export type BallotVote = z.infer<typeof ballotVoteSchema>;
