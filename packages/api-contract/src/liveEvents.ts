import { z } from "zod";

const id = z.uuid();

export const liveEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("meeting.changed"), meetingId: id }).strict(),
  z
    .object({
      type: z.literal("resource.changed"),
      resourceId: id,
      actor: z.object({ id: z.string().min(1), displayName: z.string().min(1) }).strict(),
    })
    .strict(),
]);

export type LiveEvent = z.infer<typeof liveEventSchema>;
