import { z } from "zod";
import { resourceKindSchema, resourcePathSchema } from "./resources.js";

const id = z.uuid();

/**
 * The content of one resource was saved; its identity, name and location are unchanged. A workspace change without
 * this scope may have changed anything the workspace shows.
 */
const workspaceContentChange = z
  .object({
    kind: z.literal("content"),
    resource: z.object({ id, path: resourcePathSchema, kind: resourceKindSchema }).strict(),
  })
  .strict();

/** Request header carrying the client session that issued a command. */
export const LIVE_ORIGIN_HEADER = "X-Hall-Live-Origin";
export const liveOriginSchema = id;

const actor = z.object({ id: z.string().min(1), displayName: z.string().min(1) }).strict();

// @implements-requirement HALL-TR-LIV-010
export const liveEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("meeting.changed"), meetingId: id, origin: id.nullable() }).strict(),
  z
    .object({
      type: z.literal("resource.changed"),
      resourceId: id,
      actor,
      origin: id.nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal("workspace.changed"),
      actor,
      change: workspaceContentChange.optional(),
      origin: id.nullable(),
    })
    .strict(),
]);

export type LiveEvent = z.infer<typeof liveEventSchema>;
export type WorkspaceContentChange = z.infer<typeof workspaceContentChange>;
type WithoutOrigin<Event> = Event extends unknown ? Omit<Event, "origin"> : never;
export type LiveEventPublication = WithoutOrigin<LiveEvent>;
