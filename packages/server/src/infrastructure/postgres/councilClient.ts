// TODO REMOVE_STALE: temporary transition.
import {
  agendaItemRecusalsSchema,
  agendaItemSchema,
  ballotParticipationSchema,
  ballotResultPreviewSchema,
  ballotSchema,
  ballotVoteSchema,
  type CreateCouncilBusiness,
  councilBusinessResourceAssociationSchema,
  councilBusinessResourceItemSchema,
  councilBusinessSchema,
  councilBusinessWorkspaceItemSchema,
  councilMeetingClosureSchema,
  councilMeetingSchema,
  createdAndScheduledCouncilBusinessSchema,
  meetingAttendanceSchema,
  meetingConductWorkspaceSchema,
  meetingDocumentResourceDetailSchema,
  type ScheduleAgendaItem,
  staleCouncilMeetingResultSchema,
} from "@hall/api-contract";
import { matchDiscriminated } from "@hall/domain";
import { HallPostgresError, type PostgresCouncil, type PostgresCouncilRequest } from "@hall/postgres";
import { z } from "zod";
import { type CouncilClient, CouncilClientError } from "../../clients/councilClient.js";
import type { RequestContextStore } from "../../security/requestContext.js";
import { DomainError, type ErrorCode } from "../../services/errors.js";

const councilErrorCodes: Record<string, ErrorCode | undefined> = {
  HV235: "conflict",
  HV114: "conflict",
  HV223: "meeting_conduct_closed",
  HV117: "previous_minutes_pending",
  HV126: "previous_minutes_pending",
  HV809: "prepared_subject_immutable",
  HV810: "prepared_subject_unavailable",
  HV807: "meeting_notice_required",
  HV808: "agenda_reopening_unavailable",
  HV801: "agenda_frozen",
  HV802: "preparation_history_immutable",
  HV803: "agenda_freeze_unavailable",
  HV804: "meeting_notice_unavailable",
  HV805: "meeting_notice_stale",
  HV806: "meeting_notice_invalid",
  HV416: "ballot_procedure_unsupported",
  HV418: "ballot_already_confirmed",
  HV420: "ballot_candidate_invalid",
  HV421: "ballot_preview_not_found",
  HV422: "ballot_preview_stale",
  HV423: "ballot_preview_required",
  HV424: "ballot_preview_mismatch",
  HV425: "ballot_preview_immutable",

  HV131: "conduct_evidence_immutable",
  HV132: "attendance_movement_unavailable",
  HV133: "conduct_chronology_invalid",
  HV134: "current_proxy_invalid",
  HV135: "conduct_evidence_immutable",
  HV136: "meeting_conduct_closed",
  HV137: "membership_record_invalid",
  HV140: "quorum_membership_required",
  HV141: "quorum_attendance_incomplete",
  HV142: "quorum_not_met",
  HV143: "conduct_chronology_invalid",
  HV144: "reconvocation_invalid",
  HV145: "conduct_evidence_immutable",
  HV146: "conduct_evidence_immutable",
  HV147: "reconvocation_notice_too_short",
  HV148: "reconvocation_scope_invalid",
  HV149: "reconvocation_confirmation_required",
  HV414: "discussion_quorum_required",
  HV417: "conduct_chronology_invalid",
  HV510: "ballot_accounting_immutable",
  HV511: "ballot_accounting_unavailable",
  HV512: "ballot_accounting_conflict",
  HV513: "ballot_voter_no_longer_eligible",
  HV514: "ballot_totals_invalid",

  HV231: "recusal_immutable",
  HV232: "recusal_recording_closed",
  HV233: "recusal_member_not_declared",
  HV234: "recusal_occurrence_locked",
  HV305: "recused_member_cannot_participate",
};

export function createPostgresCouncilClient({
  postgresCouncil,
  requestContext,
}: {
  postgresCouncil: PostgresCouncil;
  requestContext: RequestContextStore;
}): CouncilClient {
  function currentRequest(): PostgresCouncilRequest {
    const context = requestContext.current();
    if (!context?.principal) throw new Error("An authenticated request context is required for council storage");
    return {
      role: "hall_api_authenticated",
      context: {
        requestId: context.requestId,
        actorId: context.principal.id,
        contactId: context.principal.contactId,
        roles: context.principal.roles,
      },
    };
  }

  async function call<Result>(operation: () => Promise<Result>): Promise<Result> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HallPostgresError) {
        if (error.sqlState === "23505" && error.constraint === "agenda_item_recusal_agenda_item_council_member_key") {
          throw new DomainError("recusal_already_recorded", 409);
        }
        if (
          error.sqlState === "23505" &&
          (error.constraint === "resource_location_unique" || error.constraint === "resource_folder_target")
        ) {
          throw new DomainError("workspace_title_conflict", 409);
        }
        const recusalError = councilErrorCodes[error.sqlState];
        if (recusalError) throw new DomainError(recusalError, 409);
        if (error.sqlState === "HV910") throw new DomainError("prepared_subject_not_found", 404);
        if (error.sqlState === "HV709") throw new DomainError("minutes_not_generated", 409);
        if (error.sqlState === "HV607") {
          throw new CouncilClientError("invalidResourceLocation", { cause: error });
        }
        if (
          [
            "23505",
            "HV123",
            "HV124",
            "HV125",
            "HV230",
            "HV224",
            "HV225",
            "HV226",
            "HV227",
            "HV228",
            "HV229",
            "HV701",
            "HV702",
            "HV703",
            "HV704",
            "HV705",
          ].includes(error.sqlState)
        ) {
          throw new CouncilClientError("conflict", { cause: error });
        }
      }
      throw error;
    }
  }

  return {
    meetingDocuments: (id) => call(() => postgresCouncil.meetingDocuments(currentRequest(), id)),
    async meetingDocumentResource(id, resourceId) {
      return meetingDocumentResourceDetailSchema
        .nullable()
        .parse(await call(() => postgresCouncil.meetingDocumentResource(currentRequest(), id, resourceId)));
    },
    meetingDocumentContent: (id, resourceId, assetId) =>
      call(() => postgresCouncil.meetingDocumentContent(currentRequest(), id, resourceId, assetId)),
    listPreparedSubjects: (meetingId, businessId) =>
      call(() => postgresCouncil.listPreparedSubjects(currentRequest(), meetingId, businessId)),
    openPreparedSubject: (id, kind) => call(() => postgresCouncil.openPreparedSubject(currentRequest(), id, kind)),
    createPreparedSubject: (businessId, input) =>
      call(() => postgresCouncil.createPreparedSubject(currentRequest(), businessId, input)),
    schedulePreparedSubject: (meetingId, input) =>
      call(() => postgresCouncil.schedulePreparedSubject(currentRequest(), meetingId, input)),
    reopenAgenda: (id) => call(() => postgresCouncil.reopenAgenda(currentRequest(), id)),
    freezeAgenda: (id) => call(() => postgresCouncil.freezeAgenda(currentRequest(), id)),
    openAgendaFreeze: (id) => call(() => postgresCouncil.openAgendaFreeze(currentRequest(), id)),
    noticeFacts: (id) => call(() => postgresCouncil.noticeFacts(currentRequest(), id)),
    listNotices: (id) => call(() => postgresCouncil.listNotices(currentRequest(), id)),
    openNotice: (id) => call(() => postgresCouncil.openNotice(currentRequest(), id)),
    generateNotice: (id, facts, content) =>
      call(() => postgresCouncil.generateNotice(currentRequest(), id, facts, content)),
    noticeContent: (id) => call(() => postgresCouncil.noticeContent(currentRequest(), id)),
    async listBusinesses() {
      return z.array(councilBusinessSchema).parse(await call(() => postgresCouncil.listBusinesses(currentRequest())));
    },
    async listBusinessWorkspaceItems() {
      return z
        .array(councilBusinessWorkspaceItemSchema)
        .parse(await call(() => postgresCouncil.listBusinessWorkspaceItems(currentRequest())));
    },
    async openBusiness(id) {
      const business = await call(() => postgresCouncil.openBusiness(currentRequest(), id));
      return business === null ? null : councilBusinessSchema.parse(business);
    },
    async createBusiness(input: CreateCouncilBusiness) {
      return councilBusinessSchema.parse(await call(() => postgresCouncil.createBusiness(currentRequest(), input)));
    },
    async deleteBusiness(id) {
      try {
        return councilBusinessSchema.parse(await call(() => postgresCouncil.deleteBusiness(currentRequest(), id)));
      } catch (error) {
        if (error instanceof HallPostgresError && ["23503", "23001"].includes(error.sqlState)) {
          throw new DomainError("council_business_has_dependencies", 409);
        }
        throw error;
      }
    },
    async importBusinessBundle(input) {
      return councilBusinessSchema.parse(await call(() => postgresCouncil.importBusinessBundle(currentRequest(), input)));
    },
    async listBusinessResources(businessId) {
      return z
        .array(councilBusinessResourceAssociationSchema)
        .parse(await call(() => postgresCouncil.listBusinessResources(currentRequest(), businessId)));
    },
    async listBusinessResourceItems(businessIds) {
      return z
        .array(councilBusinessResourceItemSchema)
        .parse(await call(() => postgresCouncil.listBusinessResourceItems(currentRequest(), businessIds)));
    },
    async associateBusinessResource(businessId, resourceId) {
      return councilBusinessResourceAssociationSchema.parse(
        await call(() => postgresCouncil.associateBusinessResource(currentRequest(), businessId, resourceId)),
      );
    },
    async dissociateBusinessResource(businessId, resourceId) {
      return councilBusinessResourceAssociationSchema.parse(
        await call(() => postgresCouncil.dissociateBusinessResource(currentRequest(), businessId, resourceId)),
      );
    },
    async reorderBusinessResources(businessId, input) {
      return z
        .array(councilBusinessResourceAssociationSchema)
        .parse(
          await call(() => postgresCouncil.reorderBusinessResources(currentRequest(), businessId, input.resourceIds)),
        );
    },
    async listBusinessAgendaItems(businessIds) {
      return z
        .array(agendaItemSchema)
        .parse(await call(() => postgresCouncil.listBusinessAgendaItems(currentRequest(), businessIds)));
    },
    async scheduleBusinessDecisionProposal(businessId, input) {
      return agendaItemSchema.parse(
        await call(() =>
          postgresCouncil.scheduleDecisionProposal(currentRequest(), {
            councilBusinessId: businessId,
            councilMeetingId: input.councilMeetingId,
            position: input.position,
          }),
        ),
      );
    },
    async scheduleBusinessOpenQuestion(businessId, input) {
      return agendaItemSchema.parse(
        await call(() =>
          postgresCouncil.scheduleOpenQuestion(currentRequest(), {
            councilBusinessId: businessId,
            councilMeetingId: input.councilMeetingId,
            position: input.position,
          }),
        ),
      );
    },
    async listMeetings() {
      return z.array(councilMeetingSchema).parse(await call(() => postgresCouncil.listMeetings(currentRequest())));
    },
    async provisionInitialMeeting(input) {
      return councilMeetingSchema.parse(
        await call(() => postgresCouncil.provisionInitialMeeting(currentRequest(), input)),
      );
    },
    async openMeeting(id) {
      const meeting = await call(() =>
        z.uuid().safeParse(id).success
          ? postgresCouncil.openMeeting(currentRequest(), id)
          : postgresCouncil.openMeetingBySlug(currentRequest(), id),
      );
      return meeting === null ? null : councilMeetingSchema.parse(meeting);
    },
    async scheduleMeeting(id, input) {
      return councilMeetingSchema.parse(
        await call(() =>
          postgresCouncil.scheduleMeeting(currentRequest(), {
            id,
            scheduledAt: input.scheduledAt,
            location: input.location,
          }),
        ),
      );
    },
    async setMeetingOfficers(id, input) {
      return councilMeetingSchema.parse(
        await call(() => postgresCouncil.setMeetingOfficers(currentRequest(), { id, ...input })),
      );
    },
    async prepareMeeting(id, input) {
      return councilMeetingSchema.parse(
        await call(() => postgresCouncil.prepareMeeting(currentRequest(), { id, ...input })),
      );
    },
    async createAndScheduleBusiness(meetingId, input) {
      const created = await matchDiscriminated(input, "kind", {
        councilDecisionProposal: (value) =>
          call(() =>
            postgresCouncil.createAndScheduleDecisionProposal(currentRequest(), {
              path: value.path,
              name: value.name,
              reportName: value.reportName,
              reportContent: value.reportContent,
              councilMeetingId: meetingId,
              position: value.position,
            }),
          ),
        openQuestion: (value) =>
          call(() =>
            postgresCouncil.createAndScheduleOpenQuestion(currentRequest(), {
              path: value.path,
              name: value.name,
              reportName: value.reportName,
              reportContent: value.reportContent,
              councilMeetingId: meetingId,
              position: value.position,
            }),
          ),
      });
      return createdAndScheduledCouncilBusinessSchema.parse(created);
    },
    async recordMeetingOpening(id, input) {
      return meetingConductWorkspaceSchema.parse(
        await call(() => postgresCouncil.recordMeetingOpening(currentRequest(), { id, ...input })),
      );
    },
    async markMeetingStale(id) {
      return staleCouncilMeetingResultSchema.parse(await call(() => postgresCouncil.markStale(currentRequest(), id)));
    },
    async closeMeeting(id, input) {
      return councilMeetingClosureSchema.parse(
        await call(() =>
          postgresCouncil.close(currentRequest(), {
            id,
            closedAt: input.closedAt,
          }),
        ),
      );
    },
    async listAttendance(meetingId) {
      return z
        .array(meetingAttendanceSchema)
        .parse(await call(() => postgresCouncil.listAttendance(currentRequest(), meetingId)));
    },
    async recordAttendance(meetingId, input) {
      return z
        .array(meetingAttendanceSchema)
        .parse(await call(() => postgresCouncil.recordAttendance(currentRequest(), meetingId, input.attendance)));
    },
    async createBallotResultPreview(input) {
      return ballotResultPreviewSchema.parse(
        await call(() => postgresCouncil.createBallotResultPreview(currentRequest(), input)),
      );
    },
    async openBallotResultPreview(id) {
      return ballotResultPreviewSchema
        .nullable()
        .parse(await call(() => postgresCouncil.openBallotResultPreview(currentRequest(), id)));
    },
    async confirmBallotResultPreview(id) {
      return ballotSchema.parse(await call(() => postgresCouncil.confirmBallotResultPreview(currentRequest(), id)));
    },
    async meetingConduct(id) {
      return meetingConductWorkspaceSchema.parse(
        await call(() => postgresCouncil.meetingConduct(currentRequest(), id)),
      );
    },
    async addOpenQuestion(id, input) {
      return agendaItemSchema.parse(await call(() => postgresCouncil.addOpenQuestion(currentRequest(), id, input)));
    },
    async recordMeetingAttendanceEvents(id, input) {
      return meetingConductWorkspaceSchema.parse(
        await call(() => postgresCouncil.recordMeetingAttendanceEvents(currentRequest(), id, input)),
      );
    },
    async recordMeetingQuorum(id, input) {
      return meetingConductWorkspaceSchema.parse(
        await call(() => postgresCouncil.recordMeetingQuorum(currentRequest(), id, input)),
      );
    },
    async recordMeetingReconvocation(id, input) {
      return meetingConductWorkspaceSchema.parse(
        await call(() => postgresCouncil.recordMeetingReconvocation(currentRequest(), id, input)),
      );
    },
    async agendaItemRecusals(id) {
      return agendaItemRecusalsSchema.parse(await call(() => postgresCouncil.agendaItemRecusals(currentRequest(), id)));
    },
    async recordAgendaItemRecusal(id, input) {
      return agendaItemRecusalsSchema.parse(
        await call(() => postgresCouncil.recordAgendaItemRecusal(currentRequest(), id, input)),
      );
    },
    async listAgenda(meetingId) {
      return z.array(agendaItemSchema).parse(await call(() => postgresCouncil.listAgenda(currentRequest(), meetingId)));
    },
    async openAgendaItem(id) {
      const agendaItem = await call(() => postgresCouncil.openAgendaItem(currentRequest(), id));
      return agendaItem === null ? null : agendaItemSchema.parse(agendaItem);
    },
    async scheduleAgendaItem(meetingId, input: ScheduleAgendaItem) {
      const agendaItem = await matchDiscriminated(input, "kind", {
        councilDecisionProposal: (subject) =>
          call(() =>
            postgresCouncil.scheduleDecisionProposal(currentRequest(), {
              councilBusinessId: subject.councilBusinessId,
              councilMeetingId: meetingId,
              position: subject.position,
            }),
          ),
        openQuestion: (subject) =>
          call(() =>
            postgresCouncil.scheduleOpenQuestion(currentRequest(), {
              councilBusinessId: subject.councilBusinessId,
              councilMeetingId: meetingId,
              position: subject.position,
            }),
          ),
      });
      return agendaItemSchema.parse(agendaItem);
    },
    async adjournAgendaItem(id, input) {
      return agendaItemSchema.parse(
        await call(() => postgresCouncil.adjournAgendaItem(currentRequest(), id, input.adjournedAt)),
      );
    },
    async deprogramAgendaItem(id) {
      return agendaItemSchema.parse(await call(() => postgresCouncil.deprogramAgendaItem(currentRequest(), id)));
    },
    async reprogramAgendaItem(id, input) {
      return agendaItemSchema.parse(
        await call(() =>
          postgresCouncil.reprogramAgendaItem(currentRequest(), {
            agendaItemId: id,
            councilMeetingId: input.councilMeetingId,
            position: input.position,
          }),
        ),
      );
    },
    async reorderAgenda(meetingId, input) {
      return z.array(agendaItemSchema).parse(
        await call(() =>
          postgresCouncil.reorderAgenda(currentRequest(), {
            councilMeetingId: meetingId,
            agendaItemIds: input.agendaItemIds,
          }),
        ),
      );
    },
    async startAgendaItem(id, input) {
      return agendaItemSchema.parse(
        await call(() =>
          postgresCouncil.startAgendaItem(currentRequest(), {
            agendaItemId: id,
            startedAt: input.startedAt,
          }),
        ),
      );
    },
    async completeAgendaItem(id, input) {
      return agendaItemSchema.parse(
        await call(() =>
          postgresCouncil.completeAgendaItem(currentRequest(), {
            agendaItemId: id,
            completedAt: input.completedAt,
          }),
        ),
      );
    },
    async updateAgendaItemNotes(id, input) {
      return agendaItemSchema.parse(
        await call(() => postgresCouncil.updateAgendaItemNotes(currentRequest(), { id, ...input })),
      );
    },
    async listBallots(meetingId) {
      return z.array(ballotSchema).parse(await call(() => postgresCouncil.listBallots(currentRequest(), meetingId)));
    },
    async openBallot(id) {
      const ballot = await call(() => postgresCouncil.openBallot(currentRequest(), id));
      return ballot === null ? null : ballotSchema.parse(ballot);
    },
    async listBallotParticipations(ballotId) {
      return z
        .array(ballotParticipationSchema)
        .parse(await call(() => postgresCouncil.listBallotParticipations(currentRequest(), ballotId)));
    },
    async listBallotVotes(ballotId) {
      return z
        .array(ballotVoteSchema)
        .parse(await call(() => postgresCouncil.listBallotVotes(currentRequest(), ballotId)));
    },
  };
}
