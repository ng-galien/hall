import { z } from "zod";

/** Calendar dates have an exclusive end, including all-day ranges. */
export const eventScheduleSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("allDay"), start: z.iso.date(), end: z.iso.date() })
    .strict()
    .refine(({ start, end }) => end > start, "End date must follow start date"),
  z
    .object({
      kind: z.literal("timed"),
      start: z.iso.datetime({ offset: true }),
      end: z.iso.datetime({ offset: true }),
    })
    .strict()
    .refine(({ start, end }) => Date.parse(end) > Date.parse(start), "End time must follow start time"),
]);
export const eventParticipantSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("contact"), contactId: z.string().uuid() }).strict(),
  z.object({ kind: z.literal("guest"), name: z.string().trim().min(1).max(200) }).strict(),
]);
export const eventDocumentSchema = z
  .object({
    content: z.string(),
    location: z.string().max(500),
    schedule: eventScheduleSchema,
    participants: z.array(eventParticipantSchema),
  })
  .strict();
export type EventDocument = z.infer<typeof eventDocumentSchema>;
export type EventSchedule = z.infer<typeof eventScheduleSchema>;
