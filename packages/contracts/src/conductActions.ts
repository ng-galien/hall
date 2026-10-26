import { z } from "zod";

export const conductBlockerSchema = z.discriminatedUnion("code", [
  z
    .object({
      code: z.enum([
        "meetingNotStarted",
        "meetingClosed",
        "itemNotProgrammed",
        "itemCompleted",
        "itemAdjourned",
        "discussionAlreadyStarted",
        "discussionNotStarted",
        "nonVotingSubject",
        "votingSubjectRequiresBallot",
        "discussionQuorumMissing",
        "membershipMissing",
        "attendanceIncomplete",
        "observationChronology",
        "reconvocationPending",
        "freshObservationsRequired",
        "ballotChairUndetermined",
        "permissionDenied",
      ]),
    })
    .strict(),
  z
    .object({
      code: z.literal("quorumNotMet"),
      presentCount: z.number().int().nonnegative(),
      requiredPresent: z.number().int().positive(),
    })
    .strict(),
  z.object({ code: z.enum(["earlierAgendaItemPending", "anotherDiscussionActive"]), agendaItemId: z.uuid() }).strict(),
  z.object({ code: z.enum(["ballotAlreadyExists", "ballotInProgress"]), ballotId: z.uuid() }).strict(),
  z.object({ code: z.literal("minutesDocumentMissing"), minutesId: z.uuid() }).strict(),
  z
    .object({
      code: z.enum(["ballotChairNotPresent", "meetingSecretaryNotPresent"]),
      councilMemberId: z.uuid().nullable(),
    })
    .strict(),
  z.object({ code: z.literal("attendanceOutsideMembership"), memberName: z.string().min(1) }).strict(),
]);
export type ConductBlocker = z.infer<typeof conductBlockerSchema>;
export const conductBlockersSchema = z
  .object({
    startDiscussion: z.array(conductBlockerSchema),
    reviewBallot: z.array(conductBlockerSchema),
    adjourn: z.array(conductBlockerSchema),
    complete: z.array(conductBlockerSchema),
    updateNotes: z.array(conductBlockerSchema),
  })
  .strict();
export type ConductBlockers = z.infer<typeof conductBlockersSchema>;

export const meetingActionBlockersSchema = z
  .object({
    addAgendaItem: z.array(conductBlockerSchema),
    recordAttendanceEvents: z.array(conductBlockerSchema),
    recordOfficerChange: z.array(conductBlockerSchema),
    declareAuxiliaryAttendance: z.array(conductBlockerSchema),
  })
  .strict();
export type MeetingActionBlockers = z.infer<typeof meetingActionBlockersSchema>;

export const addOpenQuestionSchema = z
  .object({
    path: z.string(),
    name: z.string().trim().min(1),
    content: z.string(),
  })
  .strict();
export type AddOpenQuestion = z.infer<typeof addOpenQuestionSchema>;
