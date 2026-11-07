import { z } from "zod";

export const meetingEntryBlockerSchema = z
  .object({
    code: z.enum(["meetingClosed", "meetingNotScheduled", "meetingLocationMissing", "agendaRevisionOpen"]),
  })
  .strict();
export type MeetingEntryBlocker = z.infer<typeof meetingEntryBlockerSchema>;
export const meetingOpeningBlockerSchema = z.discriminatedUnion("code", [
  meetingEntryBlockerSchema,
  z.object({ code: z.literal("meetingAlreadyStarted") }).strict(),
  z.object({ code: z.literal("scheduledTimeNotReached"), scheduledAt: z.iso.datetime({ offset: true }) }).strict(),
]);
export type MeetingOpeningBlocker = z.infer<typeof meetingOpeningBlockerSchema>;
