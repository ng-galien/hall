import {
  type AddOpenQuestion,
  addOpenQuestionSchema,
  agendaNumberSchema,
  type CreatePreparedCouncilSubject,
  conductBlockerSchema,
  conductBlockersSchema,
  createPreparedCouncilSubjectSchema,
  type MeetingNoticeFacts,
  meetingActionBlockersSchema,
  meetingAgendaFreezeSchema,
  meetingAgendaRevisionSchema,
  meetingDocumentSourceSchema,
  meetingDocumentsSchema,
  meetingEntryBlockerSchema,
  meetingNoticeDeadlineSchema,
  meetingNoticeFactsSchema,
  meetingNoticeMeetingFactsSchema,
  meetingNoticeSchema,
  meetingOpeningBlockerSchema,
  type PreparedCouncilSubject,
  preparedCouncilSubjectKindSchema,
  preparedCouncilSubjectSchema,
  type SchedulePreparedCouncilSubject,
  schedulePreparedCouncilSubjectSchema,
} from "@hall/contracts";
import {
  agendaItemBallotStateSchema,
  agendaItemRecusalStateSchema,
  type BallotResultPreview,
  ballotResultPreviewSchema,
  type CorrectMeetingAuxiliaryAttendance,
  type CreateBallotResultPreview,
  correctMeetingAuxiliaryAttendanceSchema,
  createBallotResultPreviewSchema,
  type DeclareMeetingAuxiliaryAttendance,
  declareMeetingAuxiliaryAttendanceSchema,
  matchDiscriminated,
  meetingConductStateSchema,
  proxyLimitExceptionSchema,
  type RecordAgendaItemRecusal,
  type RecordMeetingAttendanceEvents,
  type RecordMeetingClosedSession,
  type RecordMeetingOfficerChange,
  type RecordMeetingQuorum,
  type RecordMeetingReconvocation,
  recordAgendaItemRecusalSchema,
  recordMeetingAttendanceEventsSchema,
  recordMeetingClosedSessionSchema,
  recordMeetingOfficerChangeSchema,
  recordMeetingQuorumSchema,
  recordMeetingReconvocationSchema,
} from "@hall/domain";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { recordAuditEvent } from "./audit.js";
import type { PostgresCallContext, PostgresRequest } from "./callContext.js";
import { callJson } from "./jsonCall.js";
import { minutesSummarySchema } from "./minutesModels.js";
import {
  postgresResourceDetailSchema,
  postgresResourceSummarySchema,
  resourceIdSchema,
  resourceNameSchema,
  resourcePathSchema,
} from "./resources.js";
import { PostgresTransactionManager } from "./transaction.js";

const timestampSchema = z.iso.datetime({ offset: true });

export const postgresCouncilBusinessWorkspaceSchema = z.object({
  id: resourceIdSchema,
  folderResourceId: resourceIdSchema,
  reportResourceId: resourceIdSchema,
});

export const postgresCouncilBusinessResourceAssociationSchema = z.object({
  councilBusinessId: resourceIdSchema,
  resourceId: resourceIdSchema,
  position: z.number().int().positive(),
});

export const postgresCouncilBusinessCommitteeSchema = z.object({
  committeeId: resourceIdSchema,
  name: z.string().min(1),
  archivedAt: timestampSchema.nullable(),
});

export const postgresCouncilCommitteeBusinessSchema = z.object({
  councilBusinessId: resourceIdSchema,
  title: resourceNameSchema,
});

export const postgresCouncilBusinessWorkspaceItemSchema = postgresCouncilBusinessWorkspaceSchema.extend({
  title: resourceNameSchema,
  folderPath: resourcePathSchema,
  report: z.string(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const postgresCouncilBusinessResourceItemSchema = z.intersection(
  z.object({ councilBusinessId: resourceIdSchema, position: z.number().int().positive() }),
  postgresResourceSummarySchema,
);

const createPostgresCouncilBusinessSchema = z.object({
  path: resourcePathSchema,
  name: resourceNameSchema,
  reportName: resourceNameSchema,
  reportContent: z.string(),
});

export const postgresCouncilMeetingSchema = z.object({
  id: resourceIdSchema,
  number: z.number().int().positive(),
  slug: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}-\d+$/)
    .nullable(),
  previousCouncilMeetingId: resourceIdSchema.nullable(),
  reconvocationId: resourceIdSchema.nullable(),
  minutesId: resourceIdSchema.nullable(),
  noticeDeadline: meetingNoticeDeadlineSchema,
  agendaRevision: meetingAgendaRevisionSchema,
  scheduledAt: timestampSchema.nullable(),
  location: z.string().min(1).nullable(),
  chairMemberId: resourceIdSchema.nullable(),
  secretaryMemberId: resourceIdSchema.nullable(),
  quorum: z.number().int().positive().nullable(),
  startedAt: timestampSchema.nullable(),
  closedAt: timestampSchema.nullable(),
  // TODO REMOVE_STALE: temporary incomplete meeting marker.
  stale: z.boolean(),
  closureBlockers: z.array(conductBlockerSchema),
  entryBlockers: z.array(meetingEntryBlockerSchema),
  openingBlockers: z.array(meetingOpeningBlockerSchema),
});

export const postgresMeetingAttendanceStatusSchema = z.enum(["present", "represented", "excused", "absent"]);

export const postgresMeetingAttendanceSchema = z.object({
  id: resourceIdSchema,
  councilMeetingId: resourceIdSchema,
  councilMemberId: resourceIdSchema,
  status: postgresMeetingAttendanceStatusSchema,
  proxyHolderCouncilMemberId: resourceIdSchema.nullable(),
  proxyDocumentId: resourceIdSchema.nullable(),
});

const attendanceDeclarationBase = {
  councilMemberId: resourceIdSchema,
};

export const postgresMeetingAttendanceDeclarationSchema = z.discriminatedUnion("status", [
  z.object({ ...attendanceDeclarationBase, status: z.literal("present") }),
  z.object({ ...attendanceDeclarationBase, status: z.literal("excused") }),
  z.object({ ...attendanceDeclarationBase, status: z.literal("absent") }),
  z.object({
    ...attendanceDeclarationBase,
    status: z.literal("represented"),
    proxyHolderCouncilMemberId: resourceIdSchema,
    proxyDocumentId: resourceIdSchema,
    proxyException: proxyLimitExceptionSchema.nullable().optional(),
  }),
]);

export const postgresCouncilAgendaSubjectSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("minutesApproval"),
    id: resourceIdSchema,
    minutesId: resourceIdSchema,
    documentId: resourceIdSchema.nullable(),
  }),
  z.object({
    kind: z.literal("councilDecisionProposal"),
    id: resourceIdSchema,
    textResourceId: resourceIdSchema,
    content: z.string(),
  }),
  z.object({
    kind: z.literal("openQuestion"),
    id: resourceIdSchema,
    textResourceId: resourceIdSchema,
    content: z.string(),
  }),
]);

export const postgresCouncilAgendaItemSchema = z.object({
  id: resourceIdSchema,
  title: z.string(),
  councilBusinessId: resourceIdSchema.nullable(),
  discussionSummary: z.string(),
  canStartDiscussion: z.boolean(),
  canReviewBallot: z.boolean(),
  conductBlockers: conductBlockersSchema,
  agendaNumber: agendaNumberSchema.nullable(),
  introducedAt: timestampSchema.nullable(),
  councilMeetingId: resourceIdSchema,
  position: z
    .number()
    .int()
    .refine((position) => position !== 0),
  subject: postgresCouncilAgendaSubjectSchema,
  startedAt: timestampSchema.nullable(),
  completedAt: timestampSchema.nullable(),
  adjournedAt: timestampSchema.nullable(),
});

export const postgresMeetingConductSchema = meetingConductStateSchema
  .extend({ meeting: postgresCouncilMeetingSchema, meetingActionBlockers: meetingActionBlockersSchema })
  .strict();
export type PostgresMeetingConduct = z.infer<typeof postgresMeetingConductSchema>;

export const postgresAgendaItemRecusalsSchema = agendaItemRecusalStateSchema
  .extend(agendaItemBallotStateSchema.shape)
  .extend({ agendaItem: postgresCouncilAgendaItemSchema });
export type PostgresAgendaItemRecusals = z.infer<typeof postgresAgendaItemRecusalsSchema>;

export const postgresCreatedAndScheduledCouncilBusinessSchema = z.object({
  business: postgresCouncilBusinessWorkspaceSchema,
  agendaItem: postgresCouncilAgendaItemSchema,
});

export const postgresCouncilMeetingClosureSchema = z.object({
  closedMeeting: postgresCouncilMeetingSchema,
  nextMeeting: postgresCouncilMeetingSchema,
  minutes: minutesSummarySchema,
});

export const postgresBallotModeSchema = z.enum(["public", "secret"]);
export const postgresPublicVoteChoiceSchema = z.enum(["approve", "reject", "abstain"]);
export const postgresVoteChoiceSchema = z.enum(["approve", "reject", "abstain", "blank", "invalid"]);
export const postgresBallotResultSchema = z.enum(["approve", "reject"]);

export const postgresBallotSchema = z.object({
  id: resourceIdSchema,
  agendaItemId: resourceIdSchema,
  mode: postgresBallotModeSchema,
  chairmanParticipationId: resourceIdSchema,
  resultPreviewId: resourceIdSchema.nullable(),
  completedAt: timestampSchema.nullable(),
  result: postgresBallotResultSchema.nullable(),
});

export const postgresBallotParticipationSchema = z.object({
  id: resourceIdSchema,
  ballotId: resourceIdSchema,
  meetingAttendanceId: resourceIdSchema,
  councilMemberId: resourceIdSchema,
});

export const postgresBallotVoteSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("public"),
    ballotId: resourceIdSchema,
    choice: postgresPublicVoteChoiceSchema,
    ballotParticipationId: resourceIdSchema,
    count: z.literal(1),
  }),
  z.object({
    mode: z.literal("secret"),
    ballotId: resourceIdSchema,
    choice: postgresVoteChoiceSchema,
    ballotParticipationId: z.null(),
    count: z.number().int().positive(),
  }),
]);

export type PostgresCouncilBusinessWorkspace = z.infer<typeof postgresCouncilBusinessWorkspaceSchema>;
export type PostgresCouncilBusinessResourceAssociation = z.infer<
  typeof postgresCouncilBusinessResourceAssociationSchema
>;
export type PostgresCouncilBusinessCommittee = z.infer<typeof postgresCouncilBusinessCommitteeSchema>;
export type PostgresCouncilCommitteeBusiness = z.infer<typeof postgresCouncilCommitteeBusinessSchema>;
export type PostgresCouncilBusinessWorkspaceItem = z.infer<typeof postgresCouncilBusinessWorkspaceItemSchema>;
export type PostgresCouncilBusinessResourceItem = z.infer<typeof postgresCouncilBusinessResourceItemSchema>;
export type PostgresCouncilMeeting = z.infer<typeof postgresCouncilMeetingSchema>;
export type PostgresMeetingAttendanceStatus = z.infer<typeof postgresMeetingAttendanceStatusSchema>;
export type PostgresMeetingAttendance = z.infer<typeof postgresMeetingAttendanceSchema>;
export type PostgresMeetingAttendanceDeclaration = z.infer<typeof postgresMeetingAttendanceDeclarationSchema>;
export type PostgresCouncilAgendaSubject = z.infer<typeof postgresCouncilAgendaSubjectSchema>;
export type PostgresCouncilAgendaItem = z.infer<typeof postgresCouncilAgendaItemSchema>;
export type PostgresCreatedAndScheduledCouncilBusiness = z.infer<
  typeof postgresCreatedAndScheduledCouncilBusinessSchema
>;
export type PostgresCouncilMeetingClosure = z.infer<typeof postgresCouncilMeetingClosureSchema>;
export type PostgresBallotMode = z.infer<typeof postgresBallotModeSchema>;
export type PostgresVoteChoice = z.infer<typeof postgresVoteChoiceSchema>;
export type PostgresBallotResult = z.infer<typeof postgresBallotResultSchema>;
export type PostgresBallot = z.infer<typeof postgresBallotSchema>;
export type PostgresBallotParticipation = z.infer<typeof postgresBallotParticipationSchema>;
export type PostgresBallotVote = z.infer<typeof postgresBallotVoteSchema>;
export type PostgresCouncilRequest = PostgresRequest;
export type CreatePostgresCouncilBusiness = z.input<typeof createPostgresCouncilBusinessSchema>;

const scheduleAgendaItemInputSchema = z.object({
  councilBusinessId: resourceIdSchema,
  councilMeetingId: resourceIdSchema,
  position: z.number().int().positive(),
});

const reprogramAgendaItemInputSchema = z.object({
  agendaItemId: resourceIdSchema,
  councilMeetingId: resourceIdSchema,
  position: z.number().int().positive(),
});

const reorderCouncilAgendaInputSchema = z
  .object({
    councilMeetingId: resourceIdSchema,
    agendaItemIds: z.array(resourceIdSchema),
  })
  .refine((value) => new Set(value.agendaItemIds).size === value.agendaItemIds.length, {
    message: "Each agenda item must occur exactly once",
    path: ["agendaItemIds"],
  });

const scheduleCouncilMeetingInputSchema = z.object({
  id: resourceIdSchema,
  scheduledAt: timestampSchema,
  location: z.string().trim().min(1),
});

const setCouncilMeetingOfficersInputSchema = z.object({
  id: resourceIdSchema,
  chairMemberId: resourceIdSchema,
  secretaryMemberId: resourceIdSchema,
});

const prepareCouncilMeetingInputSchema = scheduleCouncilMeetingInputSchema.extend({
  chairMemberId: resourceIdSchema,
  secretaryMemberId: resourceIdSchema,
});

const createAndScheduleBusinessInputSchema = createPostgresCouncilBusinessSchema.extend({
  councilMeetingId: resourceIdSchema,
  position: z.number().int().positive(),
});

const provisionInitialCouncilMeetingInputSchema = z.object({}).strict();

const recordMeetingOpeningInputSchema = z.object({
  id: resourceIdSchema,
  chairMemberId: resourceIdSchema,
  secretaryMemberId: resourceIdSchema,
  attendance: z.array(postgresMeetingAttendanceDeclarationSchema).min(1),
});

const startAgendaItemInputSchema = z.object({
  agendaItemId: resourceIdSchema,
});

const completeAgendaItemInputSchema = z.object({
  agendaItemId: resourceIdSchema,
});

export type ScheduleAgendaItemInput = z.input<typeof scheduleAgendaItemInputSchema>;
export type ProvisionInitialCouncilMeetingInput = z.input<typeof provisionInitialCouncilMeetingInputSchema>;
export type ReprogramAgendaItemInput = z.input<typeof reprogramAgendaItemInputSchema>;
export type ReorderCouncilAgendaInput = z.input<typeof reorderCouncilAgendaInputSchema>;
export type ScheduleCouncilMeetingInput = z.input<typeof scheduleCouncilMeetingInputSchema>;
export type SetCouncilMeetingOfficersInput = z.input<typeof setCouncilMeetingOfficersInputSchema>;
export type PrepareCouncilMeetingInput = z.input<typeof prepareCouncilMeetingInputSchema>;
export type CreateAndScheduleBusinessInput = z.input<typeof createAndScheduleBusinessInputSchema>;
export type RecordMeetingOpeningInput = z.input<typeof recordMeetingOpeningInputSchema>;
export type StartAgendaItemInput = z.input<typeof startAgendaItemInputSchema>;
export type CompleteAgendaItemInput = z.input<typeof completeAgendaItemInputSchema>;

const closeCouncilMeetingInputSchema = z.object({
  id: resourceIdSchema,
});

export type CloseCouncilMeetingInput = z.input<typeof closeCouncilMeetingInputSchema>;

function attendanceDeclarationsPayload(declarations: PostgresMeetingAttendanceDeclaration[]) {
  return declarations.map((declaration) =>
    matchDiscriminated(declaration, "status", {
      present: (value) => ({ council_member_id: value.councilMemberId, status: value.status }),
      excused: (value) => ({ council_member_id: value.councilMemberId, status: value.status }),
      absent: (value) => ({ council_member_id: value.councilMemberId, status: value.status }),
      represented: (value) => ({
        council_member_id: value.councilMemberId,
        status: value.status,
        proxy_holder_council_member_id: value.proxyHolderCouncilMemberId,
        proxy_document_id: value.proxyDocumentId,
        proxy_exception: value.proxyException ?? null,
      }),
    }),
  );
}

const postgresCouncilReorganizationSideSchema = z
  .object({ id: resourceIdSchema, title: z.string(), folderPath: z.string() })
  .passthrough();

export const postgresCouncilReorganizationPlanSchema = z
  .object({
    from: postgresCouncilReorganizationSideSchema,
    to: postgresCouncilReorganizationSideSchema,
    blockers: z.array(z.string()),
    applied: z.boolean(),
    movedResourceIds: z.array(resourceIdSchema).optional(),
    updatedResourceIds: z.array(resourceIdSchema).optional(),
  })
  .passthrough();
export type PostgresCouncilReorganizationPlan = z.infer<typeof postgresCouncilReorganizationPlanSchema>;

// @implements-requirement HALL-FR-BUS-080
// @implements-requirement HALL-FR-BUS-090
async function recordReorganization(
  client: PoolClient,
  gesture: "moveSubject" | "mergeBusiness",
  plan: PostgresCouncilReorganizationPlan,
): Promise<void> {
  const subjectIds =
    gesture === "moveSubject"
      ? [plan.subjectId]
      : Array.isArray(plan.subjects)
        ? plan.subjects.map((subject) => (subject as { subjectId?: unknown }).subjectId)
        : [];
  const details = {
    gesture,
    fromCouncilBusinessId: plan.from.id,
    fromTitle: plan.from.title,
    toCouncilBusinessId: plan.to.id,
    toTitle: plan.to.title,
    subjectIds,
    movedResourceIds: plan.movedResourceIds ?? [],
    updatedResourceIds: plan.updatedResourceIds ?? [],
  };
  for (const businessId of [plan.from.id, plan.to.id])
    await recordAuditEvent(client, {
      targetType: "council-business",
      targetId: businessId,
      outcome: "succeeded",
      details,
    });
  for (const resourceId of [...(plan.movedResourceIds ?? []), ...(plan.updatedResourceIds ?? [])])
    await recordAuditEvent(client, {
      targetType: "resource",
      targetId: resourceId,
      outcome: "succeeded",
      details: { gesture, fromTitle: plan.from.title, toTitle: plan.to.title },
    });
}

export class PostgresCouncil {
  meetingDocuments(request: PostgresCouncilRequest, id: string) {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.documents.read") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.meeting_documents($1::uuid) AS payload",
          values: [resourceIdSchema.parse(id)],
          schema: meetingDocumentsSchema,
        }),
    );
  }
  meetingDocumentResource(request: PostgresCouncilRequest, id: string, resourceId: string) {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.document-resource.read") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.meeting_document_resource($1::uuid,$2::uuid) AS payload",
          values: [resourceIdSchema.parse(id), resourceIdSchema.parse(resourceId)],
          schema: z
            .object({
              source: meetingDocumentSourceSchema,
              resource: postgresResourceDetailSchema,
              editorAssets: z.array(
                z.object({ id: resourceIdSchema, title: z.string(), mediaType: z.string() }).strict(),
              ),
            })
            .strict()
            .nullable(),
        }),
    );
  }
  meetingDocumentContent(
    request: PostgresCouncilRequest,
    id: string,
    resourceId: string,
    assetId: string | null = null,
  ) {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.document-content.read") },
      async (client) => {
        const result = await callJson(client, {
          text: "SELECT hall_api.meeting_document_content($1::uuid,$2::uuid,$3::uuid) AS payload",
          values: [
            resourceIdSchema.parse(id),
            resourceIdSchema.parse(resourceId),
            resourceIdSchema.nullable().parse(assetId),
          ],
          schema: z.object({ contentBase64: z.string(), mediaType: z.string() }).strict().nullable(),
        });
        return result ? { content: Buffer.from(result.contentBase64, "base64"), mediaType: result.mediaType } : null;
      },
    );
  }

  listPreparedSubjects(
    request: PostgresCouncilRequest,
    meetingId: string | null = null,
    businessId: string | null = null,
  ) {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-business.list-prepared-subjects") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.list_prepared_council_subjects($1::uuid,$2::uuid) AS payload",
          values: [resourceIdSchema.nullable().parse(meetingId), resourceIdSchema.nullable().parse(businessId)],
          schema: z.array(preparedCouncilSubjectSchema),
        }),
    );
  }
  openPreparedSubject(request: PostgresCouncilRequest, id: string, kind: PreparedCouncilSubject["kind"]) {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-business.open-prepared-subject") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.open_prepared_council_subject($1::uuid,$2::text) AS payload",
          values: [resourceIdSchema.parse(id), preparedCouncilSubjectKindSchema.parse(kind)],
          schema: preparedCouncilSubjectSchema.nullable(),
        }),
    );
  }
  createPreparedSubject(request: PostgresCouncilRequest, businessId: string, input: CreatePreparedCouncilSubject) {
    const parsed = createPreparedCouncilSubjectSchema.parse(input);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-business.create-prepared-subject") },
      async (client) => {
        const result = await callJson(client, {
          text: "SELECT hall_api.create_prepared_council_subject($1::uuid,$2::text,$3::text,$4::text) AS payload",
          values: [resourceIdSchema.parse(businessId), parsed.kind, parsed.name, parsed.content],
          schema: preparedCouncilSubjectSchema,
        });
        await recordAuditEvent(client, {
          targetType: "council-business",
          targetId: businessId,
          outcome: "succeeded",
          details: { sourceId: result.id, kind: result.kind },
        });
        return result;
      },
    );
  }
  schedulePreparedSubject(request: PostgresCouncilRequest, meetingId: string, input: SchedulePreparedCouncilSubject) {
    const parsed = schedulePreparedCouncilSubjectSchema.parse(input);
    const identity = parsed.subjectId;
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "agenda-item.schedule-prepared") },
      async (client) => {
        const result = await callJson(client, {
          text: "SELECT hall_api.schedule_prepared_council_subject($1::uuid,$2::uuid,$3::text,$4::integer) AS payload",
          values: [resourceIdSchema.parse(meetingId), identity, parsed.kind, parsed.position],
          schema: postgresCouncilAgendaItemSchema,
        });
        await recordAuditEvent(client, {
          targetType: "agenda-item",
          targetId: result.id,
          outcome: "succeeded",
          details: { sourceId: identity, kind: parsed.kind, councilMeetingId: meetingId },
        });
        return result;
      },
    );
  }

  reopenAgenda(request: PostgresCouncilRequest, id: string) {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.reopen-agenda") },
      async (client) => {
        const result = await callJson(client, {
          text: "SELECT hall_api.reopen_council_agenda($1::uuid) AS payload",
          values: [resourceIdSchema.parse(id)],
          schema: postgresCouncilMeetingSchema,
        });
        await recordAuditEvent(client, { targetType: "council-meeting", targetId: id, outcome: "succeeded" });
        return result;
      },
    );
  }
  freezeAgenda(request: PostgresCouncilRequest, id: string) {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.freeze-agenda") },
      async (client) => {
        const result = await callJson(client, {
          text: "SELECT hall_api.freeze_council_agenda($1::uuid) AS payload",
          values: [resourceIdSchema.parse(id)],
          schema: postgresCouncilMeetingSchema,
        });
        await recordAuditEvent(client, { targetType: "council-meeting", targetId: id, outcome: "succeeded" });
        return result;
      },
    );
  }
  resetAgendaRevision(request: PostgresCouncilRequest, id: string) {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.reset-agenda-revision") },
      async (client) => {
        const result = await callJson(client, {
          text: "SELECT hall_api.reset_council_agenda_revision($1::uuid) AS payload",
          values: [resourceIdSchema.parse(id)],
          schema: postgresCouncilMeetingSchema,
        });
        await recordAuditEvent(client, { targetType: "council-meeting", targetId: id, outcome: "succeeded" });
        return result;
      },
    );
  }
  openAgendaFreeze(request: PostgresCouncilRequest, id: string) {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.open-agenda-freeze") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.open_council_agenda_freeze($1::uuid) AS payload",
          values: [resourceIdSchema.parse(id)],
          schema: meetingAgendaFreezeSchema.nullable(),
        }),
    );
  }
  noticeFacts(request: PostgresCouncilRequest, id: string) {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.notice-facts") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.meeting_notice_facts($1::uuid) AS payload",
          values: [resourceIdSchema.parse(id)],
          schema: meetingNoticeMeetingFactsSchema.nullable(),
        }),
    );
  }
  noticeDraftFacts(request: PostgresCouncilRequest, id: string) {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.notice-facts") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.meeting_notice_draft_facts($1::uuid) AS payload",
          values: [resourceIdSchema.parse(id)],
          schema: meetingNoticeMeetingFactsSchema.nullable(),
        }),
    );
  }
  listNotices(request: PostgresCouncilRequest, id: string) {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.list-notices") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.list_meeting_notices($1::uuid) AS payload",
          values: [resourceIdSchema.parse(id)],
          schema: z.array(meetingNoticeSchema),
        }),
    );
  }
  openNotice(request: PostgresCouncilRequest, id: string) {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.open-notice") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.open_meeting_notice($1::uuid) AS payload",
          values: [resourceIdSchema.parse(id)],
          schema: meetingNoticeSchema.nullable(),
        }),
    );
  }
  generateNotice(request: PostgresCouncilRequest, id: string, facts: MeetingNoticeFacts, content: Buffer) {
    const parsed = meetingNoticeFactsSchema.parse(facts);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.generate-notice") },
      async (client) => {
        const result = await callJson(client, {
          text: "SELECT hall_api.generate_meeting_notice($1::uuid,$2::jsonb,$3::bytea) AS payload",
          values: [resourceIdSchema.parse(id), JSON.stringify(parsed), z.instanceof(Buffer).parse(content)],
          schema: meetingNoticeSchema,
        });
        await recordAuditEvent(client, {
          targetType: "council-meeting",
          targetId: id,
          outcome: "succeeded",
          details: { noticeId: result.id, version: result.version },
        });
        return result;
      },
    );
  }
  noticeContent(request: PostgresCouncilRequest, id: string) {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.notice-content") },
      async (client) => {
        const result = await callJson(client, {
          text: "SELECT hall_api.meeting_notice_content($1::uuid) AS payload",
          values: [resourceIdSchema.parse(id)],
          schema: z.object({ contentBase64: z.string() }).strict().nullable(),
        });
        return result ? Buffer.from(result.contentBase64, "base64") : null;
      },
    );
  }

  private readonly transactions: PostgresTransactionManager;

  updateAgendaItemNotes(
    request: PostgresCouncilRequest,
    input: { id: string; discussionSummary: string; clearConfirmed?: true },
  ): Promise<PostgresCouncilAgendaItem> {
    const parsed = z
      .object({ id: resourceIdSchema, discussionSummary: z.string(), clearConfirmed: z.literal(true).optional() })
      .strict()
      .parse(input);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "agenda-item.update-notes") },
      async (client) => {
        const result = await callJson(client, {
          text: "SELECT hall_api.update_council_agenda_item_notes($1::uuid,$2::text,$3::boolean) AS payload",
          values: [parsed.id, parsed.discussionSummary, parsed.clearConfirmed === true],
          schema: postgresCouncilAgendaItemSchema,
        });
        await recordAuditEvent(client, {
          targetType: "agenda-item",
          targetId: parsed.id,
          outcome: "succeeded",
          details: {},
        });
        return result;
      },
    );
  }

  constructor(pool: Pool) {
    this.transactions = new PostgresTransactionManager(pool);
  }

  private runContext(request: PostgresCouncilRequest, action: string): PostgresCallContext {
    return { ...request.context, action };
  }

  listBusinesses(request: PostgresCouncilRequest): Promise<PostgresCouncilBusinessWorkspace[]> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-business.list") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.list_council_business() AS payload",
          schema: z.array(postgresCouncilBusinessWorkspaceSchema),
        }),
    );
  }

  listBusinessWorkspaceItems(request: PostgresCouncilRequest): Promise<PostgresCouncilBusinessWorkspaceItem[]> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-business.workspace.list") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.list_council_business_workspace_items() AS payload",
          schema: z.array(postgresCouncilBusinessWorkspaceItemSchema),
        }),
    );
  }

  listBusinessResourceItems(
    request: PostgresCouncilRequest,
    businessIds: readonly string[],
  ): Promise<PostgresCouncilBusinessResourceItem[]> {
    const parsedBusinessIds = z.array(resourceIdSchema).min(1).max(100).parse(businessIds);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-business.resource-items.list") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.list_council_business_resource_items($1::uuid[]) AS payload",
          values: [parsedBusinessIds],
          schema: z.array(postgresCouncilBusinessResourceItemSchema),
        }),
    );
  }

  openBusiness(request: PostgresCouncilRequest, id: string): Promise<PostgresCouncilBusinessWorkspace | null> {
    const businessId = resourceIdSchema.parse(id);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-business.open") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.open_council_business($1::uuid) AS payload",
          values: [businessId],
          schema: postgresCouncilBusinessWorkspaceSchema.nullable(),
        }),
    );
  }

  createBusiness(
    request: PostgresCouncilRequest,
    input: CreatePostgresCouncilBusiness,
  ): Promise<PostgresCouncilBusinessWorkspace> {
    const parsed = createPostgresCouncilBusinessSchema.parse(input);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-business.create") },
      async (client) => {
        const business = await callJson(client, {
          text: "SELECT hall_api.create_council_business($1::text, $2::text, $3::text, $4::text) AS payload",
          values: [parsed.path, parsed.name, parsed.reportName, parsed.reportContent],
          schema: postgresCouncilBusinessWorkspaceSchema,
        });
        await recordAuditEvent(client, {
          targetType: "council-business",
          targetId: business.id,
          outcome: "succeeded",
        });
        return business;
      },
    );
  }

  deleteBusiness(request: PostgresCouncilRequest, id: string): Promise<PostgresCouncilBusinessWorkspace> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-business.delete") },
      async (client) => {
        const business = await callJson(client, {
          text: "SELECT hall_api.delete_council_business($1::uuid) AS payload",
          values: [id],
          schema: postgresCouncilBusinessWorkspaceSchema,
        });
        await recordAuditEvent(client, { targetType: "council-business", targetId: id, outcome: "succeeded" });
        return business;
      },
    );
  }

  /** Moves a prepared subject with its text to another business, or previews the move. */
  moveSubject(
    request: PostgresCouncilRequest,
    subjectId: string,
    kind: PreparedCouncilSubject["kind"],
    input: { targetCouncilBusinessId: string; preview: boolean },
  ): Promise<PostgresCouncilReorganizationPlan> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-business.move-subject") },
      async (client) => {
        const plan = await callJson(client, {
          text: "SELECT hall_api.move_prepared_council_subject($1::uuid,$2::text,$3::uuid,$4::boolean) AS payload",
          values: [
            resourceIdSchema.parse(subjectId),
            preparedCouncilSubjectKindSchema.parse(kind),
            resourceIdSchema.parse(input.targetCouncilBusinessId),
            input.preview,
          ],
          schema: postgresCouncilReorganizationPlanSchema,
        });
        if (plan.applied) await recordReorganization(client, "moveSubject", plan);
        return plan;
      },
    );
  }

  /** Merges a business into another one and removes it, or previews the merge. */
  mergeBusiness(
    request: PostgresCouncilRequest,
    sourceBusinessId: string,
    input: { targetCouncilBusinessId: string; preview: boolean },
  ): Promise<PostgresCouncilReorganizationPlan> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-business.merge") },
      async (client) => {
        const plan = await callJson(client, {
          text: "SELECT hall_api.merge_council_business($1::uuid,$2::uuid,$3::boolean) AS payload",
          values: [
            resourceIdSchema.parse(sourceBusinessId),
            resourceIdSchema.parse(input.targetCouncilBusinessId),
            input.preview,
          ],
          schema: postgresCouncilReorganizationPlanSchema,
        });
        if (plan.applied) await recordReorganization(client, "mergeBusiness", plan);
        return plan;
      },
    );
  }

  importBusinessBundle(
    request: PostgresCouncilRequest,
    input: {
      manifest: Record<string, unknown>;
      files: Record<string, string>;
      path: string;
    },
  ): Promise<PostgresCouncilBusinessWorkspace> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-business.import-bundle") },
      async (client) => {
        const business = await callJson(client, {
          text: "SELECT hall_api.import_council_business_bundle($1::jsonb,$2::jsonb,$3::text) AS payload",
          values: [JSON.stringify(input.manifest), JSON.stringify(input.files), input.path],
          schema: postgresCouncilBusinessWorkspaceSchema,
        });
        await recordAuditEvent(client, { targetType: "council-business", targetId: business.id, outcome: "succeeded" });
        return business;
      },
    );
  }

  addOpenQuestion(
    request: PostgresCouncilRequest,
    meetingId: string,
    input: AddOpenQuestion,
  ): Promise<PostgresCouncilAgendaItem> {
    const value = addOpenQuestionSchema.parse(input);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.add-open-question") },
      async (client) => {
        const result = await callJson(client, {
          text: "SELECT hall_api.add_open_question($1::uuid,$2::text,$3::text,$4::text) AS payload",
          values: [resourceIdSchema.parse(meetingId), value.path, value.name, value.content],
          schema: postgresCouncilAgendaItemSchema,
        });
        await recordAuditEvent(client, {
          targetType: "council-meeting",
          targetId: meetingId,
          outcome: "succeeded",
          details: { agendaItemId: result.id },
        });
        return result;
      },
    );
  }

  meetingConduct(request: PostgresCouncilRequest, meetingId: string): Promise<PostgresMeetingConduct> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.conduct.read") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.meeting_conduct($1::uuid) AS payload",
          values: [resourceIdSchema.parse(meetingId)],
          schema: postgresMeetingConductSchema,
        }),
    );
  }
  private conductMutation(
    request: PostgresCouncilRequest,
    meetingId: string,
    action: string,
    sql: string,
    values: unknown[],
  ): Promise<PostgresMeetingConduct> {
    return this.transactions.run({ role: request.role, context: this.runContext(request, action) }, async (client) => {
      const result = await callJson(client, {
        text: sql,
        values: [resourceIdSchema.parse(meetingId), ...values],
        schema: postgresMeetingConductSchema,
      });
      await recordAuditEvent(client, { targetType: "council-meeting", targetId: meetingId, outcome: "succeeded" });
      return result;
    });
  }
  recordMeetingAttendanceEvents(
    request: PostgresCouncilRequest,
    meetingId: string,
    input: RecordMeetingAttendanceEvents,
  ): Promise<PostgresMeetingConduct> {
    const value = recordMeetingAttendanceEventsSchema.parse(input);
    return this.conductMutation(
      request,
      meetingId,
      "meeting.record-attendance-events",
      "SELECT hall_api.record_meeting_attendance_events($1::uuid,$2::jsonb) AS payload",
      [JSON.stringify(value.changes)],
    );
  }
  recordMeetingQuorum(
    request: PostgresCouncilRequest,
    meetingId: string,
    input: RecordMeetingQuorum,
  ): Promise<PostgresMeetingConduct> {
    const value = recordMeetingQuorumSchema.parse(input);
    return this.conductMutation(
      request,
      meetingId,
      "meeting.record-quorum",
      "SELECT hall_api.record_meeting_quorum($1::uuid,$2::uuid) AS payload",
      [value.agendaItemId],
    );
  }
  recordMeetingReconvocation(
    request: PostgresCouncilRequest,
    meetingId: string,
    input: RecordMeetingReconvocation,
  ): Promise<PostgresMeetingConduct> {
    const value = recordMeetingReconvocationSchema.parse(input);
    return this.conductMutation(
      request,
      meetingId,
      "meeting.record-reconvocation",
      "SELECT hall_api.record_meeting_reconvocation($1::uuid,$2::uuid,$3::timestamptz,$4::timestamptz,$5::text,$6::text,$7::text,$8::uuid[]) AS payload",
      [
        value.failedObservationId,
        value.sentAt,
        value.scheduledAt,
        value.timeZone,
        value.firstNoticeEvidence,
        value.renewedNoticeEvidence,
        value.agendaItemIds,
      ],
    );
  }

  recordMeetingOfficerChange(
    request: PostgresCouncilRequest,
    meetingId: string,
    input: RecordMeetingOfficerChange,
  ): Promise<PostgresMeetingConduct> {
    const value = recordMeetingOfficerChangeSchema.parse(input);
    return this.conductMutation(
      request,
      meetingId,
      "meeting.record-officer-change",
      "SELECT hall_api.record_meeting_officer_change($1::uuid,$2::text,$3::uuid) AS payload",
      [value.office, value.councilMemberId],
    );
  }
  declareMeetingAuxiliaryAttendance(
    request: PostgresCouncilRequest,
    meetingId: string,
    input: DeclareMeetingAuxiliaryAttendance,
  ): Promise<PostgresMeetingConduct> {
    const value = declareMeetingAuxiliaryAttendanceSchema.parse(input);
    return this.conductMutation(
      request,
      meetingId,
      "meeting.declare-auxiliary-attendance",
      "SELECT hall_api.declare_meeting_auxiliary_attendance($1::uuid,$2::uuid,$3::text,$4::text,$5::text) AS payload",
      matchDiscriminated(value.person, "kind", {
        contact: (person) => [person.contactId, null, null, value.quality],
        newContact: (person) => [null, person.firstName, person.lastName, value.quality],
      }),
    );
  }
  recordMeetingClosedSession(
    request: PostgresCouncilRequest,
    meetingId: string,
    input: RecordMeetingClosedSession,
  ): Promise<PostgresMeetingConduct> {
    const value = recordMeetingClosedSessionSchema.parse(input);
    return this.conductMutation(
      request,
      meetingId,
      "meeting.record-closed-session",
      "SELECT hall_api.record_meeting_closed_session($1::uuid,$2::uuid[],$3::integer,$4::boolean,$5::uuid[]) AS payload",
      matchDiscriminated(value.scope, "kind", {
        wholeMeeting: () => [value.requesterMemberIds, value.approvals, true, null],
        agendaItems: (scope) => [value.requesterMemberIds, value.approvals, false, scope.agendaItemIds],
      }),
    );
  }
  correctMeetingAuxiliaryAttendance(
    request: PostgresCouncilRequest,
    meetingId: string,
    input: CorrectMeetingAuxiliaryAttendance,
  ): Promise<PostgresMeetingConduct> {
    const value = correctMeetingAuxiliaryAttendanceSchema.parse(input);
    return matchDiscriminated(value, "kind", {
      quality: (correction) =>
        this.conductMutation(
          request,
          meetingId,
          "meeting.correct-auxiliary-attendance",
          "SELECT hall_api.update_meeting_auxiliary_attendance($1::uuid,$2::uuid,$3::text) AS payload",
          [correction.attendanceId, correction.quality],
        ),
      removal: (correction) =>
        this.conductMutation(
          request,
          meetingId,
          "meeting.correct-auxiliary-attendance",
          "SELECT hall_api.remove_meeting_auxiliary_attendance($1::uuid,$2::uuid) AS payload",
          [correction.attendanceId],
        ),
    });
  }

  agendaItemRecusals(request: PostgresCouncilRequest, id: string): Promise<PostgresAgendaItemRecusals> {
    const itemId = resourceIdSchema.parse(id);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "agenda-item.recusals.read") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.agenda_item_recusals($1::uuid) AS payload",
          values: [itemId],
          schema: postgresAgendaItemRecusalsSchema,
        }),
    );
  }

  recordAgendaItemRecusal(
    request: PostgresCouncilRequest,
    id: string,
    input: RecordAgendaItemRecusal,
  ): Promise<PostgresAgendaItemRecusals> {
    const itemId = resourceIdSchema.parse(id);
    const parsed = recordAgendaItemRecusalSchema.parse(input);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "agenda-item.record-recusal") },
      async (client) => {
        const result = await callJson(client, {
          text: "SELECT hall_api.record_agenda_item_recusal($1::uuid, $2::uuid, $3::text) AS payload",
          values: [itemId, parsed.councilMemberId, parsed.legalBasis],
          schema: postgresAgendaItemRecusalsSchema,
        });
        await recordAuditEvent(client, { targetType: "agenda-item", targetId: itemId, outcome: "succeeded" });
        return result;
      },
    );
  }

  listBusinessResources(
    request: PostgresCouncilRequest,
    businessId: string,
  ): Promise<PostgresCouncilBusinessResourceAssociation[]> {
    const parsedBusinessId = resourceIdSchema.parse(businessId);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-business.resources.list") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.list_council_business_resources($1::uuid) AS payload",
          values: [parsedBusinessId],
          schema: z.array(postgresCouncilBusinessResourceAssociationSchema),
        }),
    );
  }

  /** The given council businesses whose removal the current constraints accept. */
  listDeletableBusinesses(request: PostgresCouncilRequest, businessIds: readonly string[]): Promise<string[]> {
    const parsedIds = z.array(resourceIdSchema).parse(businessIds);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-business.deletable.list") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.deletable_council_businesses($1::uuid[]) AS payload",
          values: [parsedIds],
          schema: z.array(resourceIdSchema),
        }),
    );
  }

  listBusinessCommittees(
    request: PostgresCouncilRequest,
    businessId: string,
  ): Promise<PostgresCouncilBusinessCommittee[]> {
    const parsedBusinessId = resourceIdSchema.parse(businessId);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-business.committees.list") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.list_council_business_committees($1::uuid) AS payload",
          values: [parsedBusinessId],
          schema: z.array(postgresCouncilBusinessCommitteeSchema),
        }),
    );
  }

  listCommitteeBusinesses(
    request: PostgresCouncilRequest,
    committeeId: string,
  ): Promise<PostgresCouncilCommitteeBusiness[]> {
    const parsedCommitteeId = resourceIdSchema.parse(committeeId);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-committee.businesses.list") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.list_council_committee_businesses($1::uuid) AS payload",
          values: [parsedCommitteeId],
          schema: z.array(postgresCouncilCommitteeBusinessSchema),
        }),
    );
  }

  associateBusinessCommittee(
    request: PostgresCouncilRequest,
    businessId: string,
    committeeId: string,
  ): Promise<PostgresCouncilBusinessCommittee> {
    const parsedBusinessId = resourceIdSchema.parse(businessId);
    const parsedCommitteeId = resourceIdSchema.parse(committeeId);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-business.committee.associate") },
      async (client) => {
        const association = await callJson(client, {
          text: "SELECT hall_api.associate_council_business_committee($1::uuid, $2::uuid) AS payload",
          values: [parsedBusinessId, parsedCommitteeId],
          schema: postgresCouncilBusinessCommitteeSchema,
        });
        await recordAuditEvent(client, {
          targetType: "council-business",
          targetId: parsedBusinessId,
          outcome: "succeeded",
          details: { committeeId: parsedCommitteeId },
        });
        return association;
      },
    );
  }

  dissociateBusinessCommittee(
    request: PostgresCouncilRequest,
    businessId: string,
    committeeId: string,
  ): Promise<PostgresCouncilBusinessCommittee> {
    const parsedBusinessId = resourceIdSchema.parse(businessId);
    const parsedCommitteeId = resourceIdSchema.parse(committeeId);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-business.committee.dissociate") },
      async (client) => {
        const association = await callJson(client, {
          text: "SELECT hall_api.dissociate_council_business_committee($1::uuid, $2::uuid) AS payload",
          values: [parsedBusinessId, parsedCommitteeId],
          schema: postgresCouncilBusinessCommitteeSchema,
        });
        await recordAuditEvent(client, {
          targetType: "council-business",
          targetId: parsedBusinessId,
          outcome: "succeeded",
          details: { committeeId: parsedCommitteeId },
        });
        return association;
      },
    );
  }

  associateBusinessResource(
    request: PostgresCouncilRequest,
    businessId: string,
    resourceId: string,
  ): Promise<PostgresCouncilBusinessResourceAssociation> {
    const parsedBusinessId = resourceIdSchema.parse(businessId);
    const parsedResourceId = resourceIdSchema.parse(resourceId);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-business.resource.associate") },
      async (client) => {
        const association = await callJson(client, {
          text: "SELECT hall_api.associate_council_business_resource($1::uuid, $2::uuid) AS payload",
          values: [parsedBusinessId, parsedResourceId],
          schema: postgresCouncilBusinessResourceAssociationSchema,
        });
        await recordAuditEvent(client, {
          targetType: "council-business",
          targetId: parsedBusinessId,
          outcome: "succeeded",
          details: { resourceId: parsedResourceId },
        });
        return association;
      },
    );
  }

  dissociateBusinessResource(
    request: PostgresCouncilRequest,
    businessId: string,
    resourceId: string,
  ): Promise<PostgresCouncilBusinessResourceAssociation> {
    const parsedBusinessId = resourceIdSchema.parse(businessId);
    const parsedResourceId = resourceIdSchema.parse(resourceId);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-business.resource.dissociate") },
      async (client) => {
        const association = await callJson(client, {
          text: "SELECT hall_api.dissociate_council_business_resource($1::uuid, $2::uuid) AS payload",
          values: [parsedBusinessId, parsedResourceId],
          schema: postgresCouncilBusinessResourceAssociationSchema,
        });
        await recordAuditEvent(client, {
          targetType: "council-business",
          targetId: parsedBusinessId,
          outcome: "succeeded",
          details: { resourceId: parsedResourceId },
        });
        return association;
      },
    );
  }

  reorderBusinessResources(
    request: PostgresCouncilRequest,
    businessId: string,
    resourceIds: readonly string[],
  ): Promise<PostgresCouncilBusinessResourceAssociation[]> {
    const parsedBusinessId = resourceIdSchema.parse(businessId);
    const parsedResourceIds = z.array(resourceIdSchema).parse(resourceIds);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-business.resources.reorder") },
      async (client) => {
        const associations = await callJson(client, {
          text: "SELECT hall_api.reorder_council_business_resources($1::uuid, $2::uuid[]) AS payload",
          values: [parsedBusinessId, parsedResourceIds],
          schema: z.array(postgresCouncilBusinessResourceAssociationSchema),
        });
        await recordAuditEvent(client, {
          targetType: "council-business",
          targetId: parsedBusinessId,
          outcome: "succeeded",
          details: { resourceCount: parsedResourceIds.length },
        });
        return associations;
      },
    );
  }

  listMeetings(request: PostgresCouncilRequest): Promise<PostgresCouncilMeeting[]> {
    return this.transactions.run({ role: request.role, context: this.runContext(request, "meeting.list") }, (client) =>
      callJson(client, {
        text: "SELECT hall_api.list_council_meetings() AS payload",
        schema: z.array(postgresCouncilMeetingSchema),
      }),
    );
  }

  provisionInitialMeeting(
    request: PostgresCouncilRequest,
    input: ProvisionInitialCouncilMeetingInput,
  ): Promise<PostgresCouncilMeeting> {
    provisionInitialCouncilMeetingInputSchema.parse(input);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.provision-initial") },
      async (client) => {
        const meeting = await callJson(client, {
          text: "SELECT hall_api.provision_initial_council_meeting() AS payload",
          values: [],
          schema: postgresCouncilMeetingSchema,
        });
        await recordAuditEvent(client, {
          targetType: "council-meeting",
          targetId: meeting.id,
          outcome: "succeeded",
        });
        return meeting;
      },
    );
  }

  openMeeting(request: PostgresCouncilRequest, id: string): Promise<PostgresCouncilMeeting | null> {
    const meetingId = resourceIdSchema.parse(id);
    return this.transactions.run({ role: request.role, context: this.runContext(request, "meeting.open") }, (client) =>
      callJson(client, {
        text: "SELECT hall_api.open_council_meeting($1::uuid) AS payload",
        values: [meetingId],
        schema: postgresCouncilMeetingSchema.nullable(),
      }),
    );
  }

  openMeetingBySlug(request: PostgresCouncilRequest, slug: string): Promise<PostgresCouncilMeeting | null> {
    const parsedSlug = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}-\d+$/)
      .parse(slug);
    return this.transactions.run({ role: request.role, context: this.runContext(request, "meeting.open") }, (client) =>
      callJson(client, {
        text: "SELECT hall_api.open_council_meeting_by_slug($1::text) AS payload",
        values: [parsedSlug],
        schema: postgresCouncilMeetingSchema.nullable(),
      }),
    );
  }

  scheduleMeeting(
    request: PostgresCouncilRequest,
    input: ScheduleCouncilMeetingInput,
  ): Promise<PostgresCouncilMeeting> {
    const parsed = scheduleCouncilMeetingInputSchema.parse(input);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.schedule") },
      async (client) => {
        const meeting = await callJson(client, {
          text: "SELECT hall_api.schedule_council_meeting($1::uuid, $2::timestamptz, $3::text) AS payload",
          values: [parsed.id, parsed.scheduledAt, parsed.location],
          schema: postgresCouncilMeetingSchema,
        });
        await recordAuditEvent(client, {
          targetType: "council-meeting",
          targetId: parsed.id,
          outcome: "succeeded",
        });
        return meeting;
      },
    );
  }

  setMeetingOfficers(
    request: PostgresCouncilRequest,
    input: SetCouncilMeetingOfficersInput,
  ): Promise<PostgresCouncilMeeting> {
    const parsed = setCouncilMeetingOfficersInputSchema.parse(input);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.set-officers") },
      async (client) => {
        const meeting = await callJson(client, {
          text: "SELECT hall_api.set_council_meeting_officers($1::uuid, $2::uuid, $3::uuid) AS payload",
          values: [parsed.id, parsed.chairMemberId, parsed.secretaryMemberId],
          schema: postgresCouncilMeetingSchema,
        });
        await recordAuditEvent(client, {
          targetType: "council-meeting",
          targetId: parsed.id,
          outcome: "succeeded",
        });
        return meeting;
      },
    );
  }

  prepareMeeting(request: PostgresCouncilRequest, input: PrepareCouncilMeetingInput): Promise<PostgresCouncilMeeting> {
    const parsed = prepareCouncilMeetingInputSchema.parse(input);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.prepare") },
      async (client) => {
        const meeting = await callJson(client, {
          text: "SELECT hall_api.prepare_council_meeting($1::uuid, $2::timestamptz, $3::text, $4::uuid, $5::uuid) AS payload",
          values: [parsed.id, parsed.scheduledAt, parsed.location, parsed.chairMemberId, parsed.secretaryMemberId],
          schema: postgresCouncilMeetingSchema,
        });
        await recordAuditEvent(client, {
          targetType: "council-meeting",
          targetId: parsed.id,
          outcome: "succeeded",
        });
        return meeting;
      },
    );
  }

  private createAndScheduleBusiness(
    request: PostgresCouncilRequest,
    input: CreateAndScheduleBusinessInput,
    sql: string,
  ): Promise<PostgresCreatedAndScheduledCouncilBusiness> {
    const parsed = createAndScheduleBusinessInputSchema.parse(input);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.create-and-schedule-business") },
      async (client) => {
        const created = await callJson(client, {
          text: sql,
          values: [
            parsed.path,
            parsed.name,
            parsed.reportName,
            parsed.reportContent,
            parsed.councilMeetingId,
            parsed.position,
          ],
          schema: postgresCreatedAndScheduledCouncilBusinessSchema,
        });
        await recordAuditEvent(client, {
          targetType: "council-business",
          targetId: created.business.id,
          outcome: "succeeded",
          details: { agendaItemId: created.agendaItem.id, councilMeetingId: parsed.councilMeetingId },
        });
        return created;
      },
    );
  }

  createAndScheduleDecisionProposal(
    request: PostgresCouncilRequest,
    input: CreateAndScheduleBusinessInput,
  ): Promise<PostgresCreatedAndScheduledCouncilBusiness> {
    return this.createAndScheduleBusiness(
      request,
      input,
      "SELECT hall_api.create_and_schedule_council_decision_proposal($1::text, $2::text, $3::text, $4::text, $5::uuid, $6::integer) AS payload",
    );
  }

  createAndScheduleOpenQuestion(
    request: PostgresCouncilRequest,
    input: CreateAndScheduleBusinessInput,
  ): Promise<PostgresCreatedAndScheduledCouncilBusiness> {
    return this.createAndScheduleBusiness(
      request,
      input,
      "SELECT hall_api.create_and_schedule_open_question($1::text, $2::text, $3::text, $4::text, $5::uuid, $6::integer) AS payload",
    );
  }

  recordMeetingOpening(
    request: PostgresCouncilRequest,
    input: RecordMeetingOpeningInput,
  ): Promise<PostgresMeetingConduct> {
    const parsed = recordMeetingOpeningInputSchema.parse(input);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.record-opening") },
      async (client) => {
        const meeting = await callJson(client, {
          text: "SELECT hall_api.record_meeting_opening($1::uuid, $2::jsonb, $3::uuid, $4::uuid) AS payload",
          values: [
            parsed.id,
            JSON.stringify(attendanceDeclarationsPayload(parsed.attendance)),
            parsed.chairMemberId,
            parsed.secretaryMemberId,
          ],
          schema: postgresMeetingConductSchema,
        });
        await recordAuditEvent(client, {
          targetType: "council-meeting",
          targetId: parsed.id,
          outcome: "succeeded",
        });
        return meeting;
      },
    );
  }

  listAttendance(request: PostgresCouncilRequest, meetingId: string): Promise<PostgresMeetingAttendance[]> {
    const parsedMeetingId = resourceIdSchema.parse(meetingId);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.attendance.list") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.list_meeting_attendance($1::uuid) AS payload",
          values: [parsedMeetingId],
          schema: z.array(postgresMeetingAttendanceSchema),
        }),
    );
  }

  recordAttendance(
    request: PostgresCouncilRequest,
    meetingId: string,
    declarations: readonly PostgresMeetingAttendanceDeclaration[],
  ): Promise<PostgresMeetingAttendance[]> {
    const parsedMeetingId = resourceIdSchema.parse(meetingId);
    const parsedDeclarations = z.array(postgresMeetingAttendanceDeclarationSchema).min(1).parse(declarations);
    const payload = attendanceDeclarationsPayload(parsedDeclarations);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.attendance.record") },
      async (client) => {
        const attendance = await callJson(client, {
          text: "SELECT hall_api.record_meeting_attendance($1::uuid, $2::jsonb) AS payload",
          values: [parsedMeetingId, JSON.stringify(payload)],
          schema: z.array(postgresMeetingAttendanceSchema),
        });
        await recordAuditEvent(client, {
          targetType: "council-meeting",
          targetId: parsedMeetingId,
          outcome: "succeeded",
          details: { attendanceCount: attendance.length },
        });
        return attendance;
      },
    );
  }

  listAgenda(request: PostgresCouncilRequest, meetingId: string): Promise<PostgresCouncilAgendaItem[]> {
    const parsedMeetingId = resourceIdSchema.parse(meetingId);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.agenda.list") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.list_council_agenda($1::uuid) AS payload",
          values: [parsedMeetingId],
          schema: z.array(postgresCouncilAgendaItemSchema),
        }),
    );
  }

  listBusinessAgendaItems(
    request: PostgresCouncilRequest,
    businessIds: readonly string[],
  ): Promise<PostgresCouncilAgendaItem[]> {
    const parsedBusinessIds = z.array(resourceIdSchema).min(1).max(100).parse(businessIds);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-business.agenda-items.list") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.list_council_business_agenda_items($1::uuid[]) AS payload",
          values: [parsedBusinessIds],
          schema: z.array(postgresCouncilAgendaItemSchema),
        }),
    );
  }

  openAgendaItem(request: PostgresCouncilRequest, id: string): Promise<PostgresCouncilAgendaItem | null> {
    const agendaItemId = resourceIdSchema.parse(id);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "agenda-item.open") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.open_council_agenda_item($1::uuid) AS payload",
          values: [agendaItemId],
          schema: postgresCouncilAgendaItemSchema.nullable(),
        }),
    );
  }

  scheduleDecisionProposal(
    request: PostgresCouncilRequest,
    input: ScheduleAgendaItemInput,
  ): Promise<PostgresCouncilAgendaItem> {
    const parsed = scheduleAgendaItemInputSchema.parse(input);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "agenda-item.schedule-decision-proposal") },
      async (client) => {
        const agendaItem = await callJson(client, {
          text: "SELECT hall_api.schedule_council_decision_proposal($1::uuid, $2::uuid, $3::integer) AS payload",
          values: [parsed.councilBusinessId, parsed.councilMeetingId, parsed.position],
          schema: postgresCouncilAgendaItemSchema,
        });
        await recordAuditEvent(client, {
          targetType: "agenda-item",
          targetId: agendaItem.id,
          outcome: "succeeded",
          details: { councilBusinessId: parsed.councilBusinessId, councilMeetingId: parsed.councilMeetingId },
        });
        return agendaItem;
      },
    );
  }

  scheduleOpenQuestion(
    request: PostgresCouncilRequest,
    input: ScheduleAgendaItemInput,
  ): Promise<PostgresCouncilAgendaItem> {
    const parsed = scheduleAgendaItemInputSchema.parse(input);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "agenda-item.schedule-open-question") },
      async (client) => {
        const agendaItem = await callJson(client, {
          text: "SELECT hall_api.schedule_open_question($1::uuid, $2::uuid, $3::integer) AS payload",
          values: [parsed.councilBusinessId, parsed.councilMeetingId, parsed.position],
          schema: postgresCouncilAgendaItemSchema,
        });
        await recordAuditEvent(client, {
          targetType: "agenda-item",
          targetId: agendaItem.id,
          outcome: "succeeded",
          details: { councilBusinessId: parsed.councilBusinessId, councilMeetingId: parsed.councilMeetingId },
        });
        return agendaItem;
      },
    );
  }

  adjournAgendaItem(request: PostgresCouncilRequest, agendaItemId: string): Promise<PostgresCouncilAgendaItem> {
    const parsedAgendaItemId = resourceIdSchema.parse(agendaItemId);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "agenda-item.adjourn") },
      async (client) => {
        const agendaItem = await callJson(client, {
          text: "SELECT hall_api.adjourn_council_agenda_item($1::uuid) AS payload",
          values: [parsedAgendaItemId],
          schema: postgresCouncilAgendaItemSchema,
        });
        await recordAuditEvent(client, {
          targetType: "agenda-item",
          targetId: agendaItem.id,
          outcome: "succeeded",
        });
        return agendaItem;
      },
    );
  }

  deprogramAgendaItem(request: PostgresCouncilRequest, agendaItemId: string): Promise<PostgresCouncilAgendaItem> {
    const parsedAgendaItemId = resourceIdSchema.parse(agendaItemId);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "agenda-item.deprogram") },
      async (client) => {
        const agendaItem = await callJson(client, {
          text: "SELECT hall_api.deprogram_council_agenda_item($1::uuid) AS payload",
          values: [parsedAgendaItemId],
          schema: postgresCouncilAgendaItemSchema,
        });
        await recordAuditEvent(client, {
          targetType: "agenda-item",
          targetId: agendaItem.id,
          outcome: "succeeded",
        });
        return agendaItem;
      },
    );
  }

  reprogramAgendaItem(
    request: PostgresCouncilRequest,
    input: ReprogramAgendaItemInput,
  ): Promise<PostgresCouncilAgendaItem> {
    const parsed = reprogramAgendaItemInputSchema.parse(input);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "agenda-item.reprogram") },
      async (client) => {
        const agendaItem = await callJson(client, {
          text: "SELECT hall_api.reprogram_council_agenda_item($1::uuid, $2::uuid, $3::integer) AS payload",
          values: [parsed.agendaItemId, parsed.councilMeetingId, parsed.position],
          schema: postgresCouncilAgendaItemSchema,
        });
        await recordAuditEvent(client, {
          targetType: "agenda-item",
          targetId: agendaItem.id,
          outcome: "succeeded",
          details: { councilMeetingId: parsed.councilMeetingId },
        });
        return agendaItem;
      },
    );
  }

  reorderAgenda(
    request: PostgresCouncilRequest,
    input: ReorderCouncilAgendaInput,
  ): Promise<PostgresCouncilAgendaItem[]> {
    const parsed = reorderCouncilAgendaInputSchema.parse(input);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.agenda.reorder") },
      async (client) => {
        const agenda = await callJson(client, {
          text: "SELECT hall_api.reorder_council_agenda($1::uuid, $2::uuid[]) AS payload",
          values: [parsed.councilMeetingId, parsed.agendaItemIds],
          schema: z.array(postgresCouncilAgendaItemSchema),
        });
        await recordAuditEvent(client, {
          targetType: "council-meeting",
          targetId: parsed.councilMeetingId,
          outcome: "succeeded",
          details: { agendaItemCount: parsed.agendaItemIds.length },
        });
        return agenda;
      },
    );
  }

  startAgendaItem(request: PostgresCouncilRequest, input: StartAgendaItemInput): Promise<PostgresCouncilAgendaItem> {
    const parsed = startAgendaItemInputSchema.parse(input);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "agenda-item.start") },
      async (client) => {
        const agendaItem = await callJson(client, {
          text: "SELECT hall_api.start_council_agenda_item($1::uuid) AS payload",
          values: [parsed.agendaItemId],
          schema: postgresCouncilAgendaItemSchema,
        });
        await recordAuditEvent(client, {
          targetType: "agenda-item",
          targetId: agendaItem.id,
          outcome: "succeeded",
        });
        return agendaItem;
      },
    );
  }

  completeAgendaItem(
    request: PostgresCouncilRequest,
    input: CompleteAgendaItemInput,
  ): Promise<PostgresCouncilAgendaItem> {
    const parsed = completeAgendaItemInputSchema.parse(input);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "agenda-item.complete-open-question") },
      async (client) => {
        const agendaItem = await callJson(client, {
          text: "SELECT hall_api.complete_non_voting_agenda_item($1::uuid) AS payload",
          values: [parsed.agendaItemId],
          schema: postgresCouncilAgendaItemSchema,
        });
        await recordAuditEvent(client, {
          targetType: "agenda-item",
          targetId: agendaItem.id,
          outcome: "succeeded",
        });
        return agendaItem;
      },
    );
  }

  listBallots(request: PostgresCouncilRequest, meetingId: string): Promise<PostgresBallot[]> {
    const parsedMeetingId = resourceIdSchema.parse(meetingId);
    return this.transactions.run({ role: request.role, context: this.runContext(request, "ballot.list") }, (client) =>
      callJson(client, {
        text: "SELECT hall_api.list_council_meeting_ballots($1::uuid) AS payload",
        values: [parsedMeetingId],
        schema: z.array(postgresBallotSchema),
      }),
    );
  }

  openBallot(request: PostgresCouncilRequest, id: string): Promise<PostgresBallot | null> {
    const ballotId = resourceIdSchema.parse(id);
    return this.transactions.run({ role: request.role, context: this.runContext(request, "ballot.open") }, (client) =>
      callJson(client, {
        text: "SELECT hall_api.open_ballot($1::uuid) AS payload",
        values: [ballotId],
        schema: postgresBallotSchema.nullable(),
      }),
    );
  }

  listBallotParticipations(request: PostgresCouncilRequest, ballotId: string): Promise<PostgresBallotParticipation[]> {
    const parsedBallotId = resourceIdSchema.parse(ballotId);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "ballot.participation.list") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.list_ballot_participations($1::uuid) AS payload",
          values: [parsedBallotId],
          schema: z.array(postgresBallotParticipationSchema),
        }),
    );
  }

  listBallotVotes(request: PostgresCouncilRequest, ballotId: string): Promise<PostgresBallotVote[]> {
    const parsedBallotId = resourceIdSchema.parse(ballotId);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "ballot.vote.list") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.list_ballot_votes($1::uuid) AS payload",
          values: [parsedBallotId],
          schema: z.array(postgresBallotVoteSchema),
        }),
    );
  }

  createBallotResultPreview(
    request: PostgresCouncilRequest,
    input: CreateBallotResultPreview,
  ): Promise<BallotResultPreview> {
    const parsed = createBallotResultPreviewSchema.parse(input);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "ballot.preview") },
      async (client) => {
        const preview = await callJson(client, {
          text: "SELECT hall_api.create_ballot_result_preview($1::uuid,$2::jsonb) AS payload",
          values: [parsed.agendaItemId, JSON.stringify(parsed.candidate)],
          schema: ballotResultPreviewSchema,
        });
        await recordAuditEvent(client, {
          targetType: "ballot-preview",
          targetId: preview.id,
          outcome: "succeeded",
          details: { agendaItemId: preview.agendaItemId, revision: preview.revision },
        });
        return preview;
      },
    );
  }

  openBallotResultPreview(request: PostgresCouncilRequest, previewId: string): Promise<BallotResultPreview | null> {
    const id = resourceIdSchema.parse(previewId);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "ballot.preview.read") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.open_ballot_result_preview($1::uuid) AS payload",
          values: [id],
          schema: ballotResultPreviewSchema.nullable(),
        }),
    );
  }

  confirmBallotResultPreview(request: PostgresCouncilRequest, previewId: string): Promise<PostgresBallot> {
    const id = resourceIdSchema.parse(previewId);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "ballot.confirm") },
      async (client) => {
        const ballot = await callJson(client, {
          text: "SELECT hall_api.confirm_ballot_result_preview($1::uuid) AS payload",
          values: [id],
          schema: postgresBallotSchema,
        });
        await recordAuditEvent(client, {
          targetType: "ballot",
          targetId: ballot.id,
          outcome: "succeeded",
          details: { previewId: id, result: ballot.result },
        });
        return ballot;
      },
    );
  }

  // TODO REMOVE_STALE: temporary transition, retaining the ordinary closure authority.
  markStale(request: PostgresCouncilRequest, id: string) {
    const target = resourceIdSchema.parse(id);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.mark-stale") },
      async (client) => {
        const result = await callJson(client, {
          text: "SELECT hall_api.mark_council_meeting_stale($1::uuid) AS payload",
          values: [target],
          schema: z.object({ staleMeeting: postgresCouncilMeetingSchema, nextMeeting: postgresCouncilMeetingSchema }),
        });
        await recordAuditEvent(client, {
          targetType: "council-meeting",
          targetId: target,
          outcome: "succeeded",
          details: { nextCouncilMeetingId: result.nextMeeting.id },
        });
        return result;
      },
    );
  }

  close(request: PostgresCouncilRequest, input: CloseCouncilMeetingInput): Promise<PostgresCouncilMeetingClosure> {
    const parsed = closeCouncilMeetingInputSchema.parse(input);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.close") },
      async (client) => {
        const closure = await callJson(client, {
          text: "SELECT hall_api.close_council_meeting($1::uuid) AS payload",
          values: [parsed.id],
          schema: postgresCouncilMeetingClosureSchema,
        });
        await recordAuditEvent(client, {
          targetType: "council-meeting",
          targetId: parsed.id,
          outcome: "succeeded",
          details: {
            nextCouncilMeetingId: closure.nextMeeting.id,
            minutesId: closure.minutes.id,
          },
        });
        return closure;
      },
    );
  }
}
