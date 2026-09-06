import { randomUUID } from "node:crypto";
import {
  type AgendaItem,
  type Ballot,
  type BallotParticipation,
  type BallotResult,
  type BallotVote,
  type CouncilBusiness,
  type CouncilBusinessResourceAssociation,
  type CouncilBusinessResourceItem,
  type CouncilBusinessWorkspaceItem,
  type CouncilMeeting,
  type MeetingAttendance,
  type MinutesDetail,
  resourceSummarySchema,
  type ScheduleAgendaItem,
} from "@hall/api-contract";
import { matchDiscriminated } from "@hall/domain";
import { type CouncilClient, CouncilClientError } from "../../clients/councilClient.js";
import type { ResourcesClient } from "../../clients/resourcesClient.js";

/** Current CouncilClient test double backed by the same resource client as the tested service. */
export function createTestCouncilClient(
  resourcesClient: ResourcesClient,
  minutesEntries = new Map<string, MinutesDetail>(),
): CouncilClient {
  const businesses = new Map<string, CouncilBusiness>();
  const businessResources = new Map<string, CouncilBusinessResourceAssociation[]>();
  const meetings = new Map<string, CouncilMeeting>();
  const attendance = new Map<string, MeetingAttendance>();
  const agendaItems = new Map<string, AgendaItem>();
  const ballots = new Map<string, Ballot>();
  const ballotParticipations = new Map<string, BallotParticipation>();
  const ballotVotes = new Map<string, BallotVote[]>();
  function requireMeeting(id: string): CouncilMeeting {
    const meeting = meetings.get(id);
    if (!meeting) throw new CouncilClientError("conflict");
    return meeting;
  }

  function requireAgendaItem(id: string): AgendaItem {
    const item = agendaItems.get(id);
    if (!item) throw new CouncilClientError("conflict");
    return item;
  }

  function requireBallot(id: string): Ballot {
    const ballot = ballots.get(id);
    if (!ballot) throw new CouncilClientError("conflict");
    return ballot;
  }

  function deriveBallotResult(ballot: Ballot, votes: readonly BallotVote[]): BallotResult {
    const approveCount = votes
      .filter((vote) => vote.choice === "approve")
      .reduce((total, vote) => total + vote.count, 0);
    const rejectCount = votes.filter((vote) => vote.choice === "reject").reduce((total, vote) => total + vote.count, 0);
    if (approveCount > rejectCount) return "approve";
    if (rejectCount > approveCount) return "reject";
    if (ballot.mode === "public") {
      const chairmanVote = votes.find(
        (vote) => vote.mode === "public" && vote.ballotParticipationId === ballot.chairmanParticipationId,
      );
      if (chairmanVote?.choice === "approve" || chairmanVote?.choice === "reject") {
        return chairmanVote.choice;
      }
    }
    return "reject";
  }

  function createAgendaItem(meetingId: string, input: ScheduleAgendaItem): AgendaItem {
    requireMeeting(meetingId);
    const agendaSubject = matchDiscriminated(input, "kind", {
      councilDecisionProposal: (value) => ({
        subject: { kind: value.kind, id: randomUUID(), textResourceId: randomUUID(), content: "" } as const,
        position: value.position,
      }),
      openQuestion: (value) => ({
        subject: { kind: value.kind, id: randomUUID() } as const,
        position: value.position,
      }),
    });
    const item: AgendaItem = {
      id: randomUUID(),
      councilBusinessId: input.councilBusinessId,
      councilMeetingId: meetingId,
      position: agendaSubject.position,
      subject: agendaSubject.subject,
      startedAt: null,
      completedAt: null,
      adjournedAt: null,
      discussionSummary: "",
    };
    agendaItems.set(item.id, item);
    return item;
  }

  return {
    async listBusinesses() {
      return [...businesses.values()];
    },
    async listBusinessWorkspaceItems() {
      return Promise.all(
        [...businesses.values()].map(async (business): Promise<CouncilBusinessWorkspaceItem> => {
          const folder = await resourcesClient.open(business.folderResourceId);
          const report = await resourcesClient.open(business.reportResourceId);
          if (!folder || folder.data.kind !== "folder" || !report || report.data.kind !== "text") {
            throw new CouncilClientError("conflict");
          }
          return {
            ...business,
            title: folder.data.name,
            folderPath: folder.data.path,
            report: report.data.content,
            createdAt: folder.data.createdAt,
            updatedAt: folder.data.updatedAt > report.data.updatedAt ? folder.data.updatedAt : report.data.updatedAt,
          };
        }),
      );
    },
    async openBusiness(id) {
      return businesses.get(id) ?? null;
    },
    async createBusiness(input) {
      const folder = await resourcesClient.create({ kind: "folder", path: input.path, name: input.name });
      const report = await resourcesClient.create({
        kind: "text",
        path: folder.data.fullPath,
        name: input.reportName,
        content: input.reportContent,
      });
      const business: CouncilBusiness = {
        id: randomUUID(),
        folderResourceId: folder.data.id,
        reportResourceId: report.data.id,
      };
      businesses.set(business.id, business);
      return business;
    },
    async listBusinessResources(businessId) {
      if (!businesses.has(businessId)) throw new CouncilClientError("conflict");
      return businessResources.get(businessId) ?? [];
    },
    async listBusinessResourceItems(businessIds) {
      const associations = businessIds.flatMap((businessId) => businessResources.get(businessId) ?? []);
      return Promise.all(
        associations.map(async (association): Promise<CouncilBusinessResourceItem> => {
          const resource = await resourcesClient.open(association.resourceId);
          if (!resource || resource.data.kind === "folder") throw new CouncilClientError("conflict");
          return {
            ...resourceSummarySchema.parse(resource.data),
            councilBusinessId: association.councilBusinessId,
            position: association.position,
          };
        }),
      );
    },
    async associateBusinessResource(businessId, resourceId) {
      if (!businesses.has(businessId)) throw new CouncilClientError("conflict");
      const resource = await resourcesClient.open(resourceId);
      if (!resource || resource.data.kind === "folder") throw new CouncilClientError("conflict");
      const current = businessResources.get(businessId) ?? [];
      if (current.some((association) => association.resourceId === resourceId)) {
        throw new CouncilClientError("conflict");
      }
      const association = { councilBusinessId: businessId, resourceId, position: current.length + 1 };
      businessResources.set(businessId, [...current, association]);
      return association;
    },
    async dissociateBusinessResource(businessId, resourceId) {
      const current = businessResources.get(businessId) ?? [];
      const association = current.find((candidate) => candidate.resourceId === resourceId);
      if (!association) throw new CouncilClientError("conflict");
      businessResources.set(
        businessId,
        current.filter((candidate) => candidate.resourceId !== resourceId),
      );
      return association;
    },
    async reorderBusinessResources(businessId, input) {
      const current = businessResources.get(businessId) ?? [];
      if (
        input.resourceIds.length !== current.length ||
        input.resourceIds.some((resourceId) => !current.some((association) => association.resourceId === resourceId))
      ) {
        throw new CouncilClientError("conflict");
      }
      const reordered = input.resourceIds.map((resourceId, index) => ({
        councilBusinessId: businessId,
        resourceId,
        position: index + 1,
      }));
      businessResources.set(businessId, reordered);
      return reordered;
    },
    async listBusinessAgendaItems(businessIds) {
      return [...agendaItems.values()].filter(
        (item) => item.councilBusinessId !== null && businessIds.includes(item.councilBusinessId),
      );
    },
    async scheduleBusinessDecisionProposal(businessId, input) {
      return createAgendaItem(input.councilMeetingId, {
        kind: "councilDecisionProposal",
        councilBusinessId: businessId,
        position: input.position,
      });
    },
    async scheduleBusinessOpenQuestion(businessId, input) {
      return createAgendaItem(input.councilMeetingId, {
        kind: "openQuestion",
        councilBusinessId: businessId,
        position: input.position,
      });
    },
    async listMeetings() {
      return [...meetings.values()];
    },
    async provisionInitialMeeting(input) {
      if (meetings.size > 0) throw new CouncilClientError("conflict");
      const meeting: CouncilMeeting = {
        id: randomUUID(),
        slug: null,
        number: 1,
        previousCouncilMeetingId: null,
        minutesId: null,
        scheduledAt: null,
        location: null,
        chairMemberId: null,
        secretaryMemberId: null,
        quorum: input.quorum,
        startedAt: null,
        closedAt: null,
      };
      meetings.set(meeting.id, meeting);
      return meeting;
    },
    async openMeeting(id) {
      return [...meetings.values()].find((meeting) => meeting.id === id || meeting.slug === id) ?? null;
    },
    async scheduleMeeting(id, input) {
      const meeting = requireMeeting(id);
      const scheduled = {
        ...meeting,
        slug: `${input.scheduledAt.slice(0, 10)}-${String(meeting.number).padStart(3, "0")}`,
        scheduledAt: input.scheduledAt,
        location: input.location,
      };
      meetings.set(id, scheduled);
      return scheduled;
    },
    async prepareMeeting(id, input) {
      await this.scheduleMeeting(id, input);
      return this.setMeetingOfficers(id, input);
    },
    async setMeetingOfficers(id, input) {
      const meeting = {
        ...requireMeeting(id),
        chairMemberId: input.chairMemberId,
        secretaryMemberId: input.secretaryMemberId,
      };
      meetings.set(id, meeting);
      return meeting;
    },
    async createAndScheduleBusiness(meetingId, input) {
      const business = await this.createBusiness({
        path: input.path,
        name: input.name,
        reportName: input.reportName,
        reportContent: input.reportContent,
      });
      const agendaItem = await this.scheduleAgendaItem(meetingId, {
        kind: input.kind,
        councilBusinessId: business.id,
        position: input.position,
      });
      return { business, agendaItem };
    },
    async startMeeting(id, input) {
      const meeting = requireMeeting(id);
      const started = { ...meeting, startedAt: input.startedAt };
      meetings.set(id, started);
      return started;
    },
    async closeMeeting(id, input) {
      const meeting = requireMeeting(id);
      const minutes: MinutesDetail = {
        id: randomUUID(),
        councilMeetingId: id,
        meetingNumber: meeting.number,
        scheduledAt: meeting.scheduledAt,
        createdAt: input.closedAt,
        updatedAt: input.closedAt,
        version: 1,
        generatedAt: null,
        documentId: null,
        sections: [...agendaItems.values()]
          .filter((entry) => entry.councilMeetingId === id)
          .map((entry) => ({ agendaItemId: entry.id, content: entry.discussionSummary })),
        facts: {
          meeting: {
            id,
            number: meeting.number,
            scheduledAt: meeting.scheduledAt,
            startedAt: meeting.startedAt!,
            closedAt: input.closedAt,
            location: meeting.location,
            quorum: meeting.quorum,
            chair: null,
            secretary: null,
          },
          attendance: [],
          agenda: [...agendaItems.values()]
            .filter((entry) => entry.councilMeetingId === id)
            .map((entry) => ({
              id: entry.id,
              position: entry.position,
              title: "Discussion",
              kind: entry.subject.kind,
              report: "",
              proposal: null,
              startedAt: entry.startedAt,
              completedAt: entry.completedAt,
              adjournedAt: entry.adjournedAt,
            })),
          ballots: [],
        },
      };
      minutesEntries.set(minutes.id, minutes);
      const closedMeeting = { ...meeting, closedAt: input.closedAt };
      const nextMeeting: CouncilMeeting = {
        id: randomUUID(),
        slug: null,
        number: meeting.number + 1,
        previousCouncilMeetingId: meeting.id,
        minutesId: null,
        scheduledAt: null,
        location: null,
        chairMemberId: null,
        secretaryMemberId: null,
        quorum: meeting.quorum,
        startedAt: null,
        closedAt: null,
      };
      meetings.set(meeting.id, closedMeeting);
      meetings.set(nextMeeting.id, nextMeeting);
      const minutesApproval: AgendaItem = {
        id: randomUUID(),
        councilBusinessId: null,
        councilMeetingId: nextMeeting.id,
        position: 1,
        subject: { kind: "minutesApproval", id: randomUUID(), minutesId: minutes.id, documentId: null },
        startedAt: null,
        completedAt: null,
        adjournedAt: null,
        discussionSummary: "",
      };
      agendaItems.set(minutesApproval.id, minutesApproval);
      const { sections: _sections, facts: _facts, ...summary } = minutes;
      return { closedMeeting, nextMeeting, minutes: summary };
    },
    async listAttendance(meetingId) {
      requireMeeting(meetingId);
      return [...attendance.values()].filter((item) => item.councilMeetingId === meetingId);
    },
    async recordAttendance(meetingId, input) {
      requireMeeting(meetingId);
      const recorded = input.attendance.map((declaration) =>
        matchDiscriminated(declaration, "status", {
          present: (value) => ({
            id: randomUUID(),
            councilMeetingId: meetingId,
            councilMemberId: value.councilMemberId,
            status: value.status,
            proxyHolderCouncilMemberId: null,
            proxyDocumentId: null,
          }),
          excused: (value) => ({
            id: randomUUID(),
            councilMeetingId: meetingId,
            councilMemberId: value.councilMemberId,
            status: value.status,
            proxyHolderCouncilMemberId: null,
            proxyDocumentId: null,
          }),
          absent: (value) => ({
            id: randomUUID(),
            councilMeetingId: meetingId,
            councilMemberId: value.councilMemberId,
            status: value.status,
            proxyHolderCouncilMemberId: null,
            proxyDocumentId: null,
          }),
          represented: (value) => ({
            id: randomUUID(),
            councilMeetingId: meetingId,
            councilMemberId: value.councilMemberId,
            status: value.status,
            proxyHolderCouncilMemberId: value.proxyHolderCouncilMemberId,
            proxyDocumentId: value.proxyDocumentId,
          }),
        }),
      );
      for (const item of recorded) attendance.set(item.id, item);
      return [...attendance.values()].filter((item) => item.councilMeetingId === meetingId);
    },
    async listAgenda(meetingId) {
      requireMeeting(meetingId);
      return [...agendaItems.values()]
        .filter((item) => item.councilMeetingId === meetingId)
        .sort((left, right) => Math.abs(left.position) - Math.abs(right.position));
    },
    async openAgendaItem(id) {
      return agendaItems.get(id) ?? null;
    },
    async scheduleAgendaItem(meetingId, input) {
      return createAgendaItem(meetingId, input);
    },
    async adjournAgendaItem(id, input) {
      const item = requireAgendaItem(id);
      const meeting = requireMeeting(item.councilMeetingId);
      if (
        !meeting.startedAt ||
        meeting.closedAt ||
        item.completedAt ||
        item.position < 0 ||
        item.subject.kind === "minutesApproval"
      )
        throw new CouncilClientError("conflict");
      const adjourned = { ...item, position: -Math.abs(item.position), adjournedAt: input.adjournedAt };
      agendaItems.set(id, adjourned);
      return adjourned;
    },
    async deprogramAgendaItem(id) {
      const item = requireAgendaItem(id);
      const deprogrammed = { ...item, position: -Math.abs(item.position) };
      agendaItems.set(id, deprogrammed);
      return deprogrammed;
    },
    async reprogramAgendaItem(id, input) {
      const item = requireAgendaItem(id);
      requireMeeting(input.councilMeetingId);
      const reprogrammed = { ...item, councilMeetingId: input.councilMeetingId, position: input.position };
      agendaItems.set(id, reprogrammed);
      return reprogrammed;
    },
    async reorderAgenda(meetingId, input) {
      requireMeeting(meetingId);
      const programmed = [...agendaItems.values()]
        .filter((item) => item.councilMeetingId === meetingId && item.position > 0)
        .sort((left, right) => left.position - right.position);
      const positions = programmed.map((item) => item.position);
      if (
        input.agendaItemIds.length !== programmed.length ||
        new Set(input.agendaItemIds).size !== programmed.length ||
        input.agendaItemIds.some((id) => !programmed.some((item) => item.id === id))
      ) {
        throw new CouncilClientError("conflict");
      }
      const minutes = programmed.find((item) => item.subject.kind === "minutesApproval");
      if (minutes && input.agendaItemIds[0] !== minutes.id) throw new CouncilClientError("conflict");
      input.agendaItemIds.forEach((id, index) => {
        const item = requireAgendaItem(id);
        agendaItems.set(id, { ...item, position: positions[index]! });
      });
      return [...agendaItems.values()]
        .filter((item) => item.councilMeetingId === meetingId)
        .sort((left, right) => Math.abs(left.position) - Math.abs(right.position));
    },
    async startAgendaItem(id, input) {
      const item = requireAgendaItem(id);
      const started = { ...item, startedAt: input.startedAt };
      agendaItems.set(id, started);
      return started;
    },
    async completeOpenQuestion(id, input) {
      const item = requireAgendaItem(id);
      if (item.subject.kind !== "openQuestion") throw new CouncilClientError("conflict");
      const completed = { ...item, completedAt: input.completedAt };
      agendaItems.set(id, completed);
      return completed;
    },
    async updateAgendaItemNotes(id, input) {
      const item = requireAgendaItem(id);
      const meeting = requireMeeting(item.councilMeetingId);
      if (!meeting.startedAt || meeting.closedAt) throw new CouncilClientError("conflict");
      const updated = { ...item, discussionSummary: input.discussionSummary };
      agendaItems.set(id, updated);
      return updated;
    },
    async listBallots(meetingId) {
      requireMeeting(meetingId);
      return [...ballots.values()].filter(
        (ballot) => requireAgendaItem(ballot.agendaItemId).councilMeetingId === meetingId,
      );
    },
    async openBallot(id) {
      return ballots.get(id) ?? null;
    },
    async listBallotParticipations(ballotId) {
      requireBallot(ballotId);
      return [...ballotParticipations.values()].filter((participation) => participation.ballotId === ballotId);
    },
    async listBallotVotes(ballotId) {
      requireBallot(ballotId);
      return ballotVotes.get(ballotId) ?? [];
    },
    async createBallot(input) {
      const item = requireAgendaItem(input.agendaItemId);
      const participations = input.participantAttendanceIds.map((attendanceId) => {
        const meetingAttendance = attendance.get(attendanceId);
        if (!meetingAttendance || meetingAttendance.councilMeetingId !== item.councilMeetingId) {
          throw new CouncilClientError("conflict");
        }
        const participation: BallotParticipation = {
          id: randomUUID(),
          ballotId: "",
          meetingAttendanceId: meetingAttendance.id,
          councilMemberId: meetingAttendance.councilMemberId,
        };
        return participation;
      });
      const ballotId = randomUUID();
      const persistedParticipations = participations.map((participation) => ({
        ...participation,
        ballotId,
      }));
      const chairmanParticipation = persistedParticipations.find(
        (participation) => participation.meetingAttendanceId === input.chairmanAttendanceId,
      );
      if (!chairmanParticipation) throw new CouncilClientError("conflict");
      const ballot: Ballot = {
        id: ballotId,
        agendaItemId: input.agendaItemId,
        mode: input.mode,
        chairmanParticipationId: chairmanParticipation.id,
        completedAt: null,
        result: null,
      };
      ballots.set(ballot.id, ballot);
      for (const participation of persistedParticipations) {
        ballotParticipations.set(participation.id, participation);
      }
      return ballot;
    },
    async recordBallotVotes(ballotId, input) {
      const ballot = requireBallot(ballotId);
      if (ballot.mode !== input.mode) throw new CouncilClientError("conflict");
      const recorded = matchDiscriminated(input, "mode", {
        public: (value) =>
          value.votes.map(
            (vote): BallotVote => ({
              mode: "public",
              ballotId,
              choice: vote.choice,
              ballotParticipationId: vote.ballotParticipationId,
              count: 1,
            }),
          ),
        secret: (value) =>
          [
            { choice: "approve", count: value.totals.approve },
            { choice: "reject", count: value.totals.reject },
            { choice: "abstain", count: value.totals.abstain },
          ]
            .filter((vote) => vote.count > 0)
            .map(
              (vote): BallotVote => ({
                mode: "secret",
                ballotId,
                choice: vote.choice as "approve" | "reject" | "abstain",
                ballotParticipationId: null,
                count: vote.count,
              }),
            ),
      });
      ballotVotes.set(ballotId, recorded);
      return recorded;
    },
    async completeBallot(ballotId, input) {
      const ballot = requireBallot(ballotId);
      const completed: Ballot = {
        ...ballot,
        completedAt: input.completedAt,
        result: deriveBallotResult(ballot, ballotVotes.get(ballotId) ?? []),
      };
      ballots.set(ballotId, completed);
      const agendaItem = requireAgendaItem(ballot.agendaItemId);
      agendaItems.set(agendaItem.id, { ...agendaItem, completedAt: input.completedAt });
      return completed;
    },
  };
}
