import {
  type AgendaItem,
  type Attendance,
  type CouncilMeeting,
  type MeetingStatus,
  transitionCouncilDecision,
  transitionTopic,
} from "@mairie/domain";
import type {
  AgendaRepository,
  AttendanceRepository,
  CouncilDecisionRepository,
  CouncilMeetingRepository,
  MeetingRosterRepository,
  RecordAttendance,
  ResourceRepository,
  TopicRepository,
  UnitOfWork,
} from "../repositories/contracts.js";
import { DomainError } from "./errors.js";
import { requireMeeting } from "./meetingContext.js";

export interface MeetingPreparationService {
  recordAttendance(meetingId: string, input: RecordAttendance): Promise<Attendance>;
  scheduleTopic(meetingId: string, topicId: string, position: number): Promise<AgendaItem>;
  removeAgendaItem(meetingId: string, itemId: string): Promise<void>;
  reorderAgenda(meetingId: string, itemIds: string[]): Promise<void>;
  setOfficers(meetingId: string, chairMemberId: string, secretaryMemberId: string): Promise<CouncilMeeting>;
}

export function createMeetingPreparationService({
  councilMeetingRepository,
  meetingRosterRepository,
  attendanceRepository,
  councilDecisionRepository,
  agendaRepository,
  resourceRepository,
  topicRepository,
  unitOfWork,
}: {
  councilMeetingRepository: CouncilMeetingRepository;
  meetingRosterRepository: MeetingRosterRepository;
  attendanceRepository: AttendanceRepository;
  councilDecisionRepository: CouncilDecisionRepository;
  agendaRepository: AgendaRepository;
  resourceRepository: ResourceRepository;
  topicRepository: TopicRepository;
  unitOfWork: UnitOfWork;
}): MeetingPreparationService {
  const requireComposableMeeting = async (meetingId: string) => {
    const meeting = await requireMeeting(councilMeetingRepository, meetingId);
    if (
      meeting.isReconvenedMeeting ||
      meeting.quorumFailure ||
      !(["draft", "scheduled"] as MeetingStatus[]).includes(meeting.status)
    ) {
      throw new DomainError("agenda_inconsistent", 409);
    }
    return meeting;
  };

  const scheduleExistingTopic = async (meetingId: string, topicId: string, position: number) => {
    const topic = await topicRepository.find(topicId);
    if (!topic) throw new DomainError("topic_not_found", 404);
    if (transitionTopic(topic.state, { type: "SCHEDULE" }) !== "scheduled") {
      throw new DomainError("agenda_inconsistent", 409);
    }
    if (topic.kind === "subject" && topic.councilDecisionId) {
      const decision = await councilDecisionRepository.find(topic.councilDecisionId);
      if (!decision) throw new DomainError("agenda_inconsistent", 409);
      const nextDecisionStatus = transitionCouncilDecision(decision.status, { type: "SCHEDULE" });
      if (nextDecisionStatus !== "scheduled") throw new DomainError("agenda_inconsistent", 409);
      await councilDecisionRepository.setStatus(decision.id, nextDecisionStatus);
    }
    const item = await agendaRepository.create(meetingId, { topicId: topic.id, position });
    await topicRepository.schedule(topic.id, meetingId, position);
    return item;
  };
  return {
    async recordAttendance(meetingId, input) {
      return unitOfWork.execute(async () => {
        const meeting = await requireMeeting(councilMeetingRepository, meetingId);
        if (!(["scheduled", "inProgress"] as MeetingStatus[]).includes(meeting.status) || meeting.quorumFailure) {
          throw new DomainError("meeting_roster_locked", 409);
        }
        const memberIds = new Set(await meetingRosterRepository.listMemberIds(meetingId));
        if (!memberIds.has(input.memberId)) throw new DomainError("council_member_not_found", 404);
        if (input.status === "represented") {
          if (!input.proxyHolderMemberId || input.proxyHolderMemberId === input.memberId) {
            throw new DomainError("proxy_invalid");
          }
          if (!memberIds.has(input.proxyHolderMemberId)) throw new DomainError("proxy_invalid");
          const proxyDocument = input.proxyDocumentId ? await resourceRepository.find(input.proxyDocumentId) : null;
          if (
            proxyDocument?.kind !== "document" ||
            proxyDocument.category !== "proxy" ||
            proxyDocument.meetingId !== meetingId
          ) {
            throw new DomainError("proxy_invalid");
          }
        }
        const result = await attendanceRepository.record(meetingId, input);
        if (result.status === "versionConflict") throw new DomainError("conflict", 409);
        if (result.status === "proxyHolderConflict") throw new DomainError("proxy_invalid");
        return result.attendance;
      });
    },
    async scheduleTopic(meetingId, topicId, position) {
      return unitOfWork.execute(async () => {
        const meeting = await requireMeeting(councilMeetingRepository, meetingId);
        const duringSession = meeting.status === "inProgress" && !meeting.quorumFailure;
        if (!duringSession) await requireComposableMeeting(meetingId);
        const actualPosition = duringSession
          ? Math.max(0, ...(await agendaRepository.listForMeeting(meetingId)).map((item) => item.position)) + 1
          : position;
        return scheduleExistingTopic(meetingId, topicId, actualPosition);
      });
    },
    async removeAgendaItem(meetingId, itemId) {
      return unitOfWork.execute(async () => {
        await requireComposableMeeting(meetingId);
        const item = await agendaRepository.find(meetingId, itemId);
        if (!item) throw new DomainError("agenda_item_not_found", 404);
        const topic = item.topic;
        if (transitionTopic(topic.state, { type: "UNSCHEDULE" }) !== "toSchedule") {
          throw new DomainError("agenda_inconsistent", 409);
        }
        await topicRepository.setState(topic.id, "toSchedule");
        if (topic.kind === "subject" && topic.councilDecisionId) {
          const decision = await councilDecisionRepository.find(topic.councilDecisionId);
          const next = decision ? transitionCouncilDecision(decision.status, { type: "RETURN_TO_PREPARATION" }) : null;
          if (decision && next) await councilDecisionRepository.setStatus(decision.id, next);
        }
        await agendaRepository.remove(meetingId, itemId);
        const remaining = await agendaRepository.listForMeeting(meetingId);
        await agendaRepository.reorder(
          meetingId,
          remaining.map((item) => item.id),
        );
      });
    },
    async reorderAgenda(meetingId, itemIds) {
      return unitOfWork.execute(async () => {
        await requireComposableMeeting(meetingId);
        const agenda = await agendaRepository.listForMeeting(meetingId);
        const knownIds = new Set(agenda.map((item) => item.id));
        const uniqueIds = new Set(itemIds);
        if (
          agenda.length !== itemIds.length ||
          uniqueIds.size !== itemIds.length ||
          itemIds.some((itemId) => !knownIds.has(itemId))
        ) {
          throw new DomainError("agenda_inconsistent", 409);
        }
        await agendaRepository.reorder(meetingId, itemIds);
        const byId = new Map(agenda.map((item) => [item.id, item]));
        for (const [index, itemId] of itemIds.entries()) {
          const topicId = byId.get(itemId)?.topic.id;
          if (topicId) await topicRepository.setPosition(topicId, index + 1);
        }
      });
    },
    async setOfficers(meetingId, chairMemberId, secretaryMemberId) {
      return unitOfWork.execute(async () => {
        const meeting = await requireMeeting(councilMeetingRepository, meetingId);
        if (meeting.status !== "scheduled" || meeting.quorumFailure) {
          throw new DomainError("invalid_meeting_transition", 409);
        }
        const rosterMemberIds = await meetingRosterRepository.listMemberIds(meetingId);
        if (!rosterMemberIds.includes(chairMemberId) || !rosterMemberIds.includes(secretaryMemberId)) {
          throw new DomainError("council_member_not_found", 404);
        }
        await councilMeetingRepository.setOfficers(meetingId, chairMemberId, secretaryMemberId);
        return (await councilMeetingRepository.find(meetingId))!;
      });
    },
  };
}
