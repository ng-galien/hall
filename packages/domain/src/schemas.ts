import { z } from "zod";

const nonEmpty = z.string().trim().min(1);
const nullableId = z.string().uuid().nullable().optional();

export const folderPathSchema = z
  .string()
  .max(512)
  .transform((value) => value.trim().replace(/^\/+|\/+$/g, ""))
  .refine(
    (value) =>
      value === "" ||
      value
        .split("/")
        .every((segment) => segment.trim().length > 0 && segment.trim() !== "." && segment.trim() !== ".."),
    "Invalid folder path",
  )
  .transform((value) =>
    value
      .split("/")
      .map((segment) => segment.trim())
      .join("/"),
  );

const resourceTagSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((value) => !value.includes("/"), "A tag cannot contain a slash")
  .transform((value) => value.toLocaleLowerCase("fr-FR"));

export const resourceTagsSchema = z
  .array(resourceTagSchema)
  .max(50)
  .default([])
  .transform((tags) => [...new Set(tags)]);

export const resourceIdsSchema = z
  .array(z.string().uuid())
  .max(100)
  .default([])
  .transform((ids) => [...new Set(ids)]);

export const createTextResourceSchema = z.object({
  kind: z.literal("text"),
  title: nonEmpty,
  folderPath: folderPathSchema.default(""),
  tags: resourceTagsSchema,
  content: z.string().default(""),
});

export const createCouncilMemberSchema = z.object({
  firstName: nonEmpty,
  lastName: nonEmpty,
  email: z.email().nullable().optional(),
  role: z.enum(["mayor", "deputyMayor", "councillor"]),
  termStartedOn: z.iso.date(),
});

export const createCouncilMeetingSchema = z.object({
  title: nonEmpty,
  startsAt: z.iso.datetime({ offset: true }),
  location: nonEmpty,
  chairMemberId: nullableId,
  secretaryMemberId: nullableId,
});

export const reconveneCouncilMeetingSchema = createCouncilMeetingSchema;

export const updateCouncilMeetingSchema = z.object({
  title: nonEmpty,
  startsAt: z.iso.datetime({ offset: true }),
  location: nonEmpty,
});

export const updateCouncilDecisionSchema = z.object({
  title: nonEmpty,
  draftText: z.string().default(""),
});

export const updateMeetingStatusSchema = z.object({
  status: z.enum(["scheduled", "inProgress", "closed", "cancelled"]),
});

export const setMeetingOfficersSchema = z.object({
  chairMemberId: z.string().uuid(),
  secretaryMemberId: z.string().uuid(),
});

export const createCouncilDecisionSchema = z.object({
  title: nonEmpty,
  draftText: z.string().default(""),
  legalityReviewRequired: z.boolean().optional().default(true),
});

export const createTopicSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("subject"),
    councilDecisionId: z.string().uuid().nullable().optional(),
    title: nonEmpty,
    report: z.string().default(""),
    folderPath: folderPathSchema.default(""),
    resourceIds: resourceIdsSchema,
  }),
  z.object({
    kind: z.literal("minutesApproval"),
    minutesOfMeetingId: z.string().uuid(),
    title: nonEmpty,
    report: z.string().default(""),
    folderPath: folderPathSchema.default(""),
    resourceIds: resourceIdsSchema,
  }),
  z.object({
    kind: z.literal("openQuestion"),
    title: nonEmpty,
    report: z.string().default(""),
    folderPath: folderPathSchema.default(""),
    resourceIds: resourceIdsSchema,
  }),
]);

export const updateTopicSchema = z.object({
  title: nonEmpty,
  report: z.string(),
  folderPath: folderPathSchema,
  resourceIds: resourceIdsSchema,
  councilDecisionId: z.string().uuid().nullable().optional(),
});

export const scheduleTopicSchema = z.object({
  meetingId: z.string().uuid(),
  position: z.number().int().positive(),
});

export const topicStateSchema = z.enum(["toSchedule", "scheduled", "inProgress", "examined", "withdrawn"]);

export const reorderAgendaSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1),
});

export const saveAgendaItemNotesSchema = z.object({
  discussionSummary: z.string(),
});

export const completeAgendaItemSchema = z.object({
  discussionSummary: z.string(),
  status: z.enum(["examined", "postponed", "withdrawn"]),
});

export const recordAttendanceSchema = z
  .object({
    memberId: z.string().uuid(),
    status: z.enum(["present", "represented", "excused", "absent"]),
    proxyHolderMemberId: nullableId,
    proxyDocumentId: nullableId,
    expectedVersion: z.number().int().positive().nullable().optional(),
  })
  .superRefine((input, context) => {
    if (input.status === "represented" && (!input.proxyHolderMemberId || !input.proxyDocumentId)) {
      context.addIssue({ code: "custom", message: "A represented member requires a proxy holder and written proxy" });
    }
    if (input.status !== "represented" && (input.proxyHolderMemberId || input.proxyDocumentId)) {
      context.addIssue({ code: "custom", message: "Only represented members can reference a proxy" });
    }
  });

const voteSchema = z.object({
  memberId: z.string().uuid(),
  castByMemberId: z.string().uuid(),
  choice: z.enum(["for", "against", "abstain", "notVoting"]),
});

const ballotTargetShape = {
  councilDecisionId: z.string().uuid().nullable().optional(),
  agendaItemId: z.string().uuid().nullable().optional(),
  recusedMemberIds: z.array(z.string().uuid()).default([]),
};

const requireExactlyOneBallotTarget = (
  input: { councilDecisionId?: string | null; agendaItemId?: string | null },
  context: z.RefinementCtx,
) => {
  if (Boolean(input.councilDecisionId) === Boolean(input.agendaItemId)) {
    context.addIssue({
      code: "custom",
      message: "A ballot targets either a council decision or an agenda item",
    });
  }
};

export const recordBallotSchema = z
  .discriminatedUnion("method", [
    z.object({
      method: z.literal("public"),
      idempotencyKey: z.string().uuid(),
      ...ballotTargetShape,
      votes: z.array(voteSchema).min(1),
    }),
    z.object({
      method: z.literal("secret"),
      idempotencyKey: z.string().uuid(),
      ...ballotTargetShape,
      totals: z.object({
        votesFor: z.number().int().nonnegative(),
        votesAgainst: z.number().int().nonnegative(),
        abstentions: z.number().int().nonnegative(),
        notVoting: z.number().int().nonnegative().default(0),
      }),
    }),
  ])
  .superRefine(requireExactlyOneBallotTarget);
