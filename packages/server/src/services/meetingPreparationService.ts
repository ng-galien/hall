import {
  type AgendaItem,
  type Attendance,
  type CouncilMeeting,
  type MeetingStatus,
  transitionCouncilDecision,
  transitionTopic,
} from "@hall/domain";
import type {
  AgendaRepository,
  AttendanceRepository,
  CouncilDecisionRepository,
  CouncilMeetingRepository,
  CreateTopic,
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
  createLateTopic(meetingId: string, input: CreateTopic): Promise<AgendaItem>;
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

  const scheduleExistingTopic = async (
    meetingId: string,
    topicId: string,
    position: number,
    addedDuringSession = false,
  ) => {
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
    const item = await agendaRepository.create(meetingId, { topicId: topic.id, position, addedDuringSession });
    await topicRepository.schedule(topic.id, meetingId, position);
    return item;
  };
  return {
    async recordAttendance(meetingId, input) {
      return unitOfWork.execute(async () => {
        const meeting = await requireMeeting(councilMeetingRepository, meetingId);
        const id = meeting.id;
        if (!(["scheduled", "inProgress"] as MeetingStatus[]).includes(meeting.status) || meeting.quorumFailure) {
          throw new DomainError("meeting_roster_locked", 409);
        }
        const memberIds = new Set(await meetingRosterRepository.listMemberIds(id));
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
            proxyDocument.meetingId !== id
          ) {
            throw new DomainError("proxy_invalid");
          }
        }
        const result = await attendanceRepository.record(id, input);
        if (result.status === "versionConflict") throw new DomainError("conflict", 409);
        if (result.status === "proxyHolderConflict" || result.status === "proxyDocumentConflict") {
          throw new DomainError("proxy_invalid");
        }
        return result.attendance;
      });
    },
    async scheduleTopic(meetingId, topicId, position) {
      return unitOfWork.execute(async () => {
        const meeting = await requireComposableMeeting(meetingId);
        return scheduleExistingTopic(meeting.id, topicId, position);
      });
    },
    async createLateTopic(meetingId, input) {
      return unitOfWork.execute(async () => {
        if (input.kind === "minutesApproval" || (input.kind === "subject" && Boolean(input.councilDecisionId))) {
          throw new DomainError("invalid_request");
        }
        const meeting = await requireMeeting(councilMeetingRepository, meetingId);
        const id = meeting.id;
        if (meeting.status !== "inProgress" || meeting.quorumFailure) {
          throw new DomainError("invalid_meeting_transition", 409);
        }
        for (const resourceId of input.resourceIds) {
          if (!(await resourceRepository.findMetadata(resourceId))) throw new DomainError("resource_not_found", 404);
        }
        const topic = await topicRepository.create(input);
        const position = Math.max(0, ...(await agendaRepository.listForMeeting(id)).map((item) => item.position)) + 1;
        return scheduleExistingTopic(id, topic.id, position, true);
      });
    },
    async removeAgendaItem(meetingId, itemId) {
      return unitOfWork.execute(async () => {
        const meeting = await requireComposableMeeting(meetingId);
        const id = meeting.id;
        const item = await agendaRepository.find(id, itemId);
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
        await agendaRepository.remove(id, itemId);
        const remaining = await agendaRepository.listForMeeting(id);
        await agendaRepository.reorder(
          id,
          remaining.map((item) => item.id),
        );
      });
    },
    async reorderAgenda(meetingId, itemIds) {
      return unitOfWork.execute(async () => {
        const meeting = await requireComposableMeeting(meetingId);
        const id = meeting.id;
        const agenda = await agendaRepository.listForMeeting(id);
        const knownIds = new Set(agenda.map((item) => item.id));
        const uniqueIds = new Set(itemIds);
        if (
          agenda.length !== itemIds.length ||
          uniqueIds.size !== itemIds.length ||
          itemIds.some((itemId) => !knownIds.has(itemId))
        ) {
          throw new DomainError("agenda_inconsistent", 409);
        }
        await agendaRepository.reorder(id, itemIds);
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
        const id = meeting.id;
        if (meeting.status !== "scheduled" || meeting.quorumFailure) {
          throw new DomainError("invalid_meeting_transition", 409);
        }
        const rosterMemberIds = await meetingRosterRepository.listMemberIds(id);
        if (!rosterMemberIds.includes(chairMemberId) || !rosterMemberIds.includes(secretaryMemberId)) {
          throw new DomainError("council_member_not_found", 404);
        }
        await councilMeetingRepository.setOfficers(id, chairMemberId, secretaryMemberId);
        return (await councilMeetingRepository.find(id))!;
      });
    },
  };
}
