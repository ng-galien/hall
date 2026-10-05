import { z } from "zod";

const id = z.uuid();

/** Request header carrying the client session that issued a command. */
export const LIVE_ORIGIN_HEADER = "X-Hall-Live-Origin";
export const liveOriginSchema = id;

// @implements-requirement HALL-TR-LIV-010
export const liveEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("meeting.changed"), meetingId: id, origin: id.nullable() }).strict(),
  z
    .object({
      type: z.literal("resource.changed"),
      resourceId: id,
      actor: z.object({ id: z.string().min(1), displayName: z.string().min(1) }).strict(),
      origin: id.nullable(),
    })
    .strict(),
]);

export type LiveEvent = z.infer<typeof liveEventSchema>;
type WithoutOrigin<Event> = Event extends unknown ? Omit<Event, "origin"> : never;
export type LiveEventPublication = WithoutOrigin<LiveEvent>;
