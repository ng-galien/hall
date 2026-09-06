import { z } from "zod";
import { resourceIdSchema } from "./resources.js";

const timestampSchema = z.iso.datetime({ offset: true });

export const ballotModeSchema = z.enum(["public", "secret"]);
export const voteChoiceSchema = z.enum(["approve", "reject", "abstain"]);
export const ballotResultSchema = z.enum(["approve", "reject"]);

export const ballotSchema = z
  .object({
    id: resourceIdSchema,
    agendaItemId: resourceIdSchema,
    mode: ballotModeSchema,
    chairmanParticipationId: resourceIdSchema,
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
      choice: voteChoiceSchema,
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

export const createBallotSchema = z
  .object({
    agendaItemId: resourceIdSchema,
    mode: ballotModeSchema,
    participantAttendanceIds: z.array(resourceIdSchema).min(1),
    chairmanAttendanceId: resourceIdSchema,
  })
  .strict()
  .refine((value) => new Set(value.participantAttendanceIds).size === value.participantAttendanceIds.length, {
    message: "A meeting attendance can participate only once",
    path: ["participantAttendanceIds"],
  })
  .refine((value) => value.participantAttendanceIds.includes(value.chairmanAttendanceId), {
    message: "The chairman attendance must participate in the ballot",
    path: ["chairmanAttendanceId"],
  });

const publicVoteInputSchema = z
  .object({
    ballotParticipationId: resourceIdSchema,
    choice: voteChoiceSchema,
  })
  .strict();

export const recordBallotVotesSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("public"),
      votes: z.array(publicVoteInputSchema).min(1),
    })
    .strict()
    .refine((value) => new Set(value.votes.map((vote) => vote.ballotParticipationId)).size === value.votes.length, {
      message: "A ballot participation can vote only once",
      path: ["votes"],
    }),
  z
    .object({
      mode: z.literal("secret"),
      totals: z
        .object({
          approve: z.number().int().nonnegative(),
          reject: z.number().int().nonnegative(),
          abstain: z.number().int().nonnegative(),
        })
        .strict(),
    })
    .strict()
    .refine((value) => value.totals.approve + value.totals.reject + value.totals.abstain > 0, {
      message: "A secret ballot must record at least one vote",
      path: ["totals"],
    }),
]);

export const completeBallotSchema = z
  .object({
    completedAt: timestampSchema,
  })
  .strict();

export type BallotMode = z.infer<typeof ballotModeSchema>;
export type VoteChoice = z.infer<typeof voteChoiceSchema>;
export type BallotResult = z.infer<typeof ballotResultSchema>;
export type Ballot = z.infer<typeof ballotSchema>;
export type BallotParticipation = z.infer<typeof ballotParticipationSchema>;
export type BallotVote = z.infer<typeof ballotVoteSchema>;
export type CreateBallot = z.infer<typeof createBallotSchema>;
export type RecordBallotVotes = z.infer<typeof recordBallotVotesSchema>;
export type CompleteBallot = z.infer<typeof completeBallotSchema>;
