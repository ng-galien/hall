import { z } from "zod";
import { resourceKindSchema, resourcePathSchema } from "./resources.js";

const id = z.uuid();

const changedResource = z.object({ id, path: resourcePathSchema, kind: resourceKindSchema }).strict();

/**
 * What one workspace write touched: the content of one resource, whose identity, name and location are unchanged; one
 * resource created, renamed, moved or described again, with the affair it was created in; one deleted resource; or
 * one affair. A workspace change without this scope may have changed anything the workspace shows.
 */
const workspaceChange = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("content"), resource: changedResource }).strict(),
  z.object({ kind: z.literal("resource"), resource: changedResource, councilBusinessId: id.optional() }).strict(),
  z.object({ kind: z.literal("removed"), resourceId: id }).strict(),
  z.object({ kind: z.literal("business"), councilBusinessId: id }).strict(),
]);

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
      change: workspaceChange.optional(),
      origin: id.nullable(),
    })
    .strict(),
]);

export type LiveEvent = z.infer<typeof liveEventSchema>;
export type WorkspaceChange = z.infer<typeof workspaceChange>;
export type WorkspaceChangedResource = z.infer<typeof changedResource>;
type WithoutOrigin<Event> = Event extends unknown ? Omit<Event, "origin"> : never;
export type LiveEventPublication = WithoutOrigin<LiveEvent>;
