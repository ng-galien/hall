import {
  agendaItemSchema,
  ballotParticipationSchema,
  ballotSchema,
  ballotVoteSchema,
  type CreateCouncilBusiness,
  createdAndScheduledCouncilBusinessSchema,
  councilBusinessResourceAssociationSchema,
  councilBusinessResourceItemSchema,
  councilBusinessSchema,
  councilBusinessWorkspaceItemSchema,
  councilMeetingClosureSchema,
  councilMeetingSchema,
  meetingAttendanceSchema,
  type ScheduleAgendaItem,
} from "@hall/api-contract";
import { matchDiscriminated } from "@hall/domain";
import { HallPostgresError, type PostgresCouncil, type PostgresCouncilRequest } from "@hall/postgres";
import { z } from "zod";
import { type CouncilClient, CouncilClientError } from "../../clients/councilClient.js";
import type { RequestContextStore } from "../../security/requestContext.js";
import { DomainError } from "../../services/errors.js";

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
        councilMemberId: context.principal.councilMemberId,
        roles: context.principal.roles,
      },
    };
  }

  async function call<Result>(operation: () => Promise<Result>): Promise<Result> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HallPostgresError) {
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
    async startMeeting(id, input) {
      return councilMeetingSchema.parse(
        await call(() => postgresCouncil.startMeeting(currentRequest(), { id, startedAt: input.startedAt })),
      );
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
    async completeOpenQuestion(id, input) {
      return agendaItemSchema.parse(
        await call(() =>
          postgresCouncil.completeOpenQuestion(currentRequest(), {
            agendaItemId: id,
            completedAt: input.completedAt,
          }),
        ),
      );
    },
    async updateAgendaItemNotes(id, input) {
      return agendaItemSchema.parse(await call(() => postgresCouncil.updateAgendaItemNotes(currentRequest(), { id, ...input })));
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
    async createBallot(input) {
      return ballotSchema.parse(await call(() => postgresCouncil.createBallot(currentRequest(), input)));
    },
    async recordBallotVotes(ballotId, input) {
      return z
        .array(ballotVoteSchema)
        .parse(await call(() => postgresCouncil.recordBallotVotes(currentRequest(), ballotId, input)));
    },
    async completeBallot(ballotId, input) {
      return ballotSchema.parse(
        await call(() =>
          postgresCouncil.completeBallot(currentRequest(), { ballotId, completedAt: input.completedAt }),
        ),
      );
    },
  };
}
