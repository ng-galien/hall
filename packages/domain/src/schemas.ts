import { z } from "zod";

const nonEmpty = z.string().trim().min(1);
const nullableId = z.string().uuid().nullable().optional();
const boundedText = (maximum: number) => z.string().trim().max(maximum);
const templateTypeName = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9.-]*$/);

const timeZoneSchema = nonEmpty.max(100).refine((timeZone) => {
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}, "Invalid IANA time zone");

const webUrlSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "URL must use HTTP or HTTPS");

export const updateHallSettingsSchema = z.object({
  name: nonEmpty.max(160),
  inseeCode: z
    .string()
    .trim()
    .regex(/^(?:\d{5}|2[AB]\d{3})$/)
    .nullable(),
  siren: z
    .string()
    .trim()
    .regex(/^\d{9}$/)
    .nullable(),
  population: z.number().int().nonnegative().nullable(),
  populationReferenceDate: z.iso.date().nullable(),
  addressLine1: boundedText(200),
  addressLine2: boundedText(200),
  postalCode: boundedText(16),
  city: boundedText(160),
  phone: boundedText(40),
  email: z.email().nullable(),
  website: webUrlSchema.nullable(),
  defaultMeetingLocation: boundedText(200),
  timeZone: timeZoneSchema,
  outboundEmailSenderName: boundedText(160),
  outboundEmailSenderAddress: z.email().nullable(),
  outboundEmailReplyToAddress: z.email().nullable(),
});

const contentTemplateShape = {
  documentType: templateTypeName,
  name: nonEmpty.max(160),
  bodyMarkdown: z.string().max(500_000),
  subject: z.string().max(500).nullable().optional(),
  stylesheet: z.string().max(100_000).default(""),
  headerHtml: z.string().max(100_000).default(""),
  footerHtml: z.string().max(100_000).default(""),
};

export const createContentTemplateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pdf"),
    ...contentTemplateShape,
    subject: z.null().optional().default(null),
  }),
  z.object({
    kind: z.literal("message"),
    ...contentTemplateShape,
    subject: nonEmpty.max(500),
    stylesheet: z.literal("").optional().default(""),
    headerHtml: z.literal("").optional().default(""),
    footerHtml: z.literal("").optional().default(""),
  }),
]);

export const updateContentTemplateSchema = createContentTemplateSchema;

export const templateRenderContextSchema = z.object({
  meetingId: z.string().uuid().optional(),
});

export const previewContentTemplateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pdf"),
    bodyMarkdown: z.string().max(500_000),
    subject: z.null().optional().default(null),
    stylesheet: z.string().max(100_000).default(""),
    headerHtml: z.string().max(100_000).default(""),
    footerHtml: z.string().max(100_000).default(""),
    context: templateRenderContextSchema.default({}),
  }),
  z.object({
    kind: z.literal("message"),
    bodyMarkdown: z.string().max(500_000),
    subject: z.string().max(500),
    context: templateRenderContextSchema.default({}),
  }),
]);

export const generateContentTemplateSchema = z.object({
  context: templateRenderContextSchema.default({}),
  attachmentResourceIds: z.array(z.string().uuid()).max(20).default([]),
  to: z.array(z.email()).max(200).default([]),
  cc: z.array(z.email()).max(200).default([]),
  bcc: z.array(z.email()).max(200).default([]),
});

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

export const updateResourceSchema = z.object({
  title: nonEmpty,
  folderPath: folderPathSchema,
  tags: resourceTagsSchema,
  content: z.string().optional(),
});

export const createCouncilMemberSchema = z.object({
  firstName: nonEmpty,
  lastName: nonEmpty,
  email: z.email().nullable().optional(),
  phone: z.preprocess((value) => (value === "" ? null : value), z.string().trim().min(3).max(40).nullable().optional()),
  role: z.enum(["mayor", "deputyMayor", "councillor"]),
  termStartedOn: z.iso.date(),
});

export const updateCouncilMemberSchema = createCouncilMemberSchema
  .extend({
    termEndedOn: z.iso.date().nullable(),
  })
  .refine((value) => value.termEndedOn === null || value.termEndedOn >= value.termStartedOn, {
    message: "The term end date cannot precede its start date",
    path: ["termEndedOn"],
  });

export const committeeRoleSchema = z.enum(["chair", "viceChair", "member"]);

export const createCouncilCommitteeSchema = z.object({
  name: nonEmpty.max(160),
  description: z.string().trim().max(10_000).default(""),
});

export const updateCouncilCommitteeSchema = createCouncilCommitteeSchema;

export const addCommitteeMembershipSchema = z.object({
  councilMemberId: z.string().uuid(),
  role: committeeRoleSchema.default("member"),
  startedOn: z.iso.date(),
});

export const updateCommitteeMembershipSchema = z
  .object({
    role: committeeRoleSchema,
    startedOn: z.iso.date(),
    endedOn: z.iso.date().nullable(),
  })
  .refine((value) => value.endedOn === null || value.endedOn >= value.startedOn, {
    message: "The membership end date cannot precede its start date",
    path: ["endedOn"],
  });

export const endCommitteeMembershipSchema = z.object({
  endedOn: z.iso.date(),
});

export const createCouncilMeetingSchema = z
  .object({
    startsAt: z.iso.datetime({ offset: true }),
    location: nonEmpty,
    chairMemberId: nullableId,
    secretaryMemberId: nullableId,
  })
  .strict();

export const reconveneCouncilMeetingSchema = createCouncilMeetingSchema.extend({
  meetingNoticeSentAt: z.iso.datetime({ offset: true }),
});

export const updateCouncilMeetingSchema = z
  .object({
    startsAt: z.iso.datetime({ offset: true }),
    location: nonEmpty,
  })
  .strict();

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

export const createCouncilBusinessSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("matter"),
    councilDecisionId: z.string().uuid().nullable().optional(),
    committeeId: z.string().uuid().nullable().optional(),
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

export const updateCouncilBusinessSchema = z
  .object({
    title: nonEmpty,
    report: z.string(),
    folderPath: folderPathSchema,
    resourceIds: resourceIdsSchema,
    committeeId: z.string().uuid().nullable().optional(),
  })
  .strict();

export const reclassifyCouncilBusinessSchema = z.object({ folderPath: folderPathSchema });

export const scheduleCouncilBusinessSchema = z.object({
  meetingId: z.string().uuid(),
  position: z.number().int().positive(),
});

export const attachCouncilBusinessDecisionSchema = z.object({
  draftText: z.string().default(""),
});

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
