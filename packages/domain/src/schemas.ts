import { z } from "zod";
import { geographicLayerIds } from "./model.js";

const nonEmpty = z.string().trim().min(1);
const nullableId = z.string().uuid().nullable().optional();
const boundedText = (maximum: number) => z.string().trim().max(maximum);
const longitudeSchema = z.number().finite().min(-180).max(180);
const latitudeSchema = z.number().finite().min(-90).max(90);
const geographicPositionSchema = z.tuple([longitudeSchema, latitudeSchema]);
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
  geographicPosition: geographicPositionSchema.nullable(),
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

export const previewPdfSchema = z.object({
  bodyMarkdown: z.string().max(500_000),
  context: templateRenderContextSchema.default({}),
});

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

export const folderNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !value.includes("/"));

export const createFolderSchema = z
  .object({
    parentPath: folderPathSchema.default(""),
    name: folderNameSchema,
  })
  .strict()
  .refine(
    ({ parentPath, name }) => folderPathSchema.safeParse(parentPath ? `${parentPath}/${name}` : name).success,
    "Invalid folder path",
  );

export const renameFolderSchema = z
  .object({
    folderPath: folderPathSchema.refine((value) => value.length > 0),
    name: folderNameSchema,
  })
  .strict();

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

export const createRemoteResourceSchema = z.object({
  kind: z.literal("remote"),
  title: nonEmpty,
  folderPath: folderPathSchema.default(""),
  tags: resourceTagsSchema,
  url: webUrlSchema.nullable().default(null),
});

const geographicColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const geographicLabelSchema = z.string().trim().min(1).max(160).nullable().default(null);

function ringSignedArea(ring: Array<[number, number]>): number {
  return ring.slice(0, -1).reduce((area, position, index) => {
    const next = ring[index + 1];
    return next ? area + position[0] * next[1] - next[0] * position[1] : area;
  }, 0);
}

function orientedRing(ring: Array<[number, number]>, counterclockwise: boolean): Array<[number, number]> {
  const isCounterclockwise = ringSignedArea(ring) > 0;
  return isCounterclockwise === counterclockwise ? ring : [...ring].reverse();
}

const geographicPointSchema = z
  .object({
    type: z.literal("Point"),
    coordinates: geographicPositionSchema,
  })
  .strict();

const geographicLineStringSchema = z
  .object({
    type: z.literal("LineString"),
    coordinates: z.array(geographicPositionSchema).min(2).max(500),
  })
  .strict();

const geographicPolygonSchema = z
  .object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(geographicPositionSchema).min(4).max(500)).min(1).max(10),
  })
  .strict()
  .refine(
    ({ coordinates }) =>
      coordinates.every((ring) => {
        const first = ring[0];
        const last = ring.at(-1);
        return first !== undefined && last !== undefined && first[0] === last[0] && first[1] === last[1];
      }),
    "Polygon rings must be closed",
  )
  .refine(
    ({ coordinates }) => coordinates.reduce((count, ring) => count + ring.length, 0) <= 1_000,
    "Polygon exceeds the coordinate limit",
  )
  .refine(({ coordinates }) => coordinates.every((ring) => ringSignedArea(ring) !== 0), "Polygon rings need an area")
  .transform(({ type, coordinates }) => ({
    type,
    coordinates: coordinates.map((ring, index) => orientedRing(ring, index === 0)),
  }));

const hallGeoJsonFeatureSchema = z.union([
  z
    .object({
      type: z.literal("Feature"),
      id: z.string().uuid(),
      properties: z
        .object({
          kind: z.literal("marker"),
          visible: z.boolean().default(true),
          label: geographicLabelSchema,
          style: z.object({ color: geographicColorSchema, size: z.enum(["small", "medium", "large"]) }).strict(),
        })
        .strict(),
      geometry: geographicPointSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("Feature"),
      id: z.string().uuid(),
      properties: z
        .object({
          kind: z.literal("line"),
          visible: z.boolean().default(true),
          label: geographicLabelSchema,
          style: z.object({ color: geographicColorSchema, width: z.number().int().min(1).max(8) }).strict(),
        })
        .strict(),
      geometry: geographicLineStringSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("Feature"),
      id: z.string().uuid(),
      properties: z
        .object({
          kind: z.literal("area"),
          visible: z.boolean().default(true),
          label: geographicLabelSchema,
          style: z
            .object({
              fillColor: geographicColorSchema,
              strokeColor: geographicColorSchema,
              strokeWidth: z.number().int().min(1).max(8),
              fillOpacity: z.number().min(0.05).max(0.8),
            })
            .strict(),
        })
        .strict(),
      geometry: geographicPolygonSchema,
    })
    .strict(),
]);

const geographicZoomSchema = z.number().min(0).max(22);

export const geographicViewSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("center"), center: geographicPositionSchema, zoom: geographicZoomSchema }).strict(),
  z
    .object({
      kind: z.literal("extent"),
      extent: z.tuple([longitudeSchema, latitudeSchema, longitudeSchema, latitudeSchema]),
      zoom: geographicZoomSchema,
    })
    .strict()
    .refine(({ extent }) => extent[0] < extent[2] && extent[1] < extent[3], "Invalid geographic extent"),
]);

export const geographicLayersSchema = z
  .array(
    z
      .object({
        id: z.enum(geographicLayerIds),
        visible: z.boolean(),
        opacity: z.number().finite().min(0).max(1),
      })
      .strict(),
  )
  .min(1)
  .max(geographicLayerIds.length)
  .refine((layers) => new Set(layers.map(({ id }) => id)).size === layers.length, {
    message: "Geographic layer identifiers must be unique",
  })
  .refine((layers) => layers.some(({ visible, opacity }) => visible && opacity > 0), {
    message: "At least one geographic layer must be visible",
  });

export const hallGeoJsonFeatureCollectionSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z.array(hallGeoJsonFeatureSchema).max(100),
  })
  .strict()
  .refine(({ features }) => new Set(features.map(({ id }) => id)).size === features.length, {
    message: "Hall GeoJSON feature identifiers must be unique",
  })
  .refine(
    ({ features }) =>
      features.reduce((count, feature) => {
        if (feature.geometry.type === "Point") return count + 1;
        if (feature.geometry.type === "LineString") return count + feature.geometry.coordinates.length;
        return count + feature.geometry.coordinates.reduce((polygonCount, ring) => polygonCount + ring.length, 0);
      }, 0) <= 5_000,
    "Hall GeoJSON layer exceeds the coordinate limit",
  );

export const createGeographicResourceSchema = z
  .object({
    title: nonEmpty.max(200),
    folderPath: folderPathSchema.default(""),
    tags: resourceTagsSchema,
    provider: z.literal("ign"),
    layers: geographicLayersSchema,
    view: geographicViewSchema.optional(),
    hallLayer: hallGeoJsonFeatureCollectionSchema.default({ type: "FeatureCollection", features: [] }),
  })
  .strict();

export const updateGeographicResourceSchema = z
  .object({
    view: geographicViewSchema,
    layers: geographicLayersSchema,
    hallLayer: hallGeoJsonFeatureCollectionSchema,
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const searchLegalReferencesSchema = z
  .object({ query: nonEmpty.max(200), effectiveAt: z.iso.date().nullable().default(null) })
  .strict();

export const createLegalReferenceResourceSchema = z
  .object({
    title: nonEmpty.max(200),
    folderPath: folderPathSchema.default(""),
    tags: resourceTagsSchema,
    provider: z.literal("legifrance"),
    referenceKind: z.literal("article"),
  })
  .strict();

export const resolveLegalReferenceResourceSchema = z
  .object({
    title: nonEmpty.max(200),
    provider: z.literal("legifrance"),
    referenceKind: z.literal("article"),
    fund: z.enum(["CODE_ETAT", "CODE_DATE"]),
    versionId: z
      .string()
      .trim()
      .regex(/^LEGIARTI[0-9A-Z]+$/),
    effectiveAt: z.iso.date().nullable().default(null),
  })
  .strict()
  .refine(({ fund, effectiveAt }) => (fund === "CODE_ETAT" ? effectiveAt === null : effectiveAt !== null), {
    message: "CODE_DATE requires an effective date and CODE_ETAT forbids it",
    path: ["effectiveAt"],
  });

export const refreshLegalReferenceSchema = z.object({ expectedSnapshotHash: z.string().length(64) }).strict();

export const updateResourceSchema = z
  .object({
    title: nonEmpty,
    folderPath: folderPathSchema,
    tags: resourceTagsSchema,
    content: z.string().optional(),
    url: webUrlSchema.nullable().optional(),
  })
  .strict();

export const editorAssetOwnerKindSchema = z.enum([
  "textResourceContent",
  "councilBusinessReport",
  "councilDecisionDraft",
  "agendaItemDiscussionSummary",
]);

export const promoteEditorAssetSchema = z.object({
  title: nonEmpty,
  folderPath: folderPathSchema,
  tags: resourceTagsSchema,
  category: z.enum(["report", "draftCouncilDecision", "meetingNotice", "minutes", "proxy", "supporting"]),
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
