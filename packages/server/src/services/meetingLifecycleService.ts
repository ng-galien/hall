import {
  type CouncilMeeting,
  isAttendanceComplete,
  type MeetingEvent,
  type MeetingStatus,
  transitionCouncilDecision,
  transitionMeeting,
  transitionTopic,
} from "@mairie/domain";
import type {
  AgendaRepository,
  AttendanceRepository,
  CouncilDecisionRepository,
  CouncilMeetingRepository,
  CouncilMemberRepository,
  CreateCouncilMeeting,
  MeetingRosterRepository,
  TopicRepository,
  UnitOfWork,
} from "../repositories/contracts.js";
import { DomainError } from "./errors.js";
import { participationForMeeting, requireMeeting } from "./meetingContext.js";

export interface MeetingLifecycleService {
  changeStatus(meetingId: string, status: MeetingStatus): Promise<CouncilMeeting>;
  recordQuorumFailure(meetingId: string): Promise<CouncilMeeting>;
  reconveneMeeting(previousMeetingId: string, input: CreateCouncilMeeting): Promise<CouncilMeeting>;
}

export function createMeetingLifecycleService({
  councilMeetingRepository,
  councilMemberRepository,
  meetingRosterRepository,
  attendanceRepository,
  agendaRepository,
  councilDecisionRepository,
  topicRepository,
  unitOfWork,
}: {
  councilMeetingRepository: CouncilMeetingRepository;
  councilMemberRepository: CouncilMemberRepository;
  meetingRosterRepository: MeetingRosterRepository;
  attendanceRepository: AttendanceRepository;
  agendaRepository: AgendaRepository;
  councilDecisionRepository: CouncilDecisionRepository;
  topicRepository: TopicRepository;
  unitOfWork: UnitOfWork;
}): MeetingLifecycleService {
  const statusEvent = (status: MeetingStatus): MeetingEvent | null => {
    if (status === "scheduled") return { type: "SCHEDULE" };
    if (status === "inProgress") return { type: "OPEN" };
    if (status === "closed") return { type: "CLOSE" };
    if (status === "cancelled") return { type: "CANCEL" };
    return null;
  };

  const releaseOpenTopics = async (meetingId: string, agendaStatus: "postponed" | "withdrawn") => {
    const agenda = await agendaRepository.listForMeeting(meetingId);
    const openItems = agenda.filter((item) => !item.completedAt);
    for (const item of openItems) {
      const topic = item.topic;
      const event = topic.state === "inProgress" ? { type: "POSTPONE" as const } : { type: "UNSCHEDULE" as const };
      if (transitionTopic(topic.state, event) !== "toSchedule") throw new DomainError("agenda_inconsistent", 409);
      if (topic.kind === "subject" && topic.councilDecisionId) {
        const decision = await councilDecisionRepository.find(topic.councilDecisionId);
        const next = decision ? transitionCouncilDecision(decision.status, { type: "RETURN_TO_PREPARATION" }) : null;
        if (!decision || !next) throw new DomainError("agenda_inconsistent", 409);
        await councilDecisionRepository.setStatus(decision.id, next);
      }
      await topicRepository.setState(topic.id, "toSchedule");
    }
    if (openItems.length > 0) {
      await agendaRepository.completeOpenItems(meetingId, agendaStatus, new Date().toISOString());
    }
  };

  return {
    async changeStatus(meetingId, status) {
      return unitOfWork.execute(async () => {
        const meeting = await requireMeeting(councilMeetingRepository, meetingId);
        const event = statusEvent(status);
        if (!event || transitionMeeting(meeting.status, event) !== status) {
          throw new DomainError("invalid_meeting_transition", 409);
        }
        if (status === "scheduled") {
          const roster = await councilMemberRepository.listActive();
          if (roster.length === 0) throw new DomainError("meeting_roster_locked", 409);
          for (const officerId of [meeting.chairMemberId, meeting.secretaryMemberId]) {
            if (officerId && !roster.some((member) => member.id === officerId)) {
              throw new DomainError("council_member_not_found", 409);
            }
          }
          await meetingRosterRepository.snapshot(
            meeting.id,
            roster.map((member) => member.id),
          );
        }
        if (status === "inProgress") {
          const evidence = await participationForMeeting(meeting, meetingRosterRepository, attendanceRepository);
          if (!isAttendanceComplete(evidence)) throw new DomainError("attendance_incomplete", 409);
          if (!evidence.quorum.reached) throw new DomainError("quorum_not_reached", 409);
          if (meeting.quorumFailure || !meeting.chairMemberId || !meeting.secretaryMemberId) {
            throw new DomainError("meeting_officers_required", 409);
          }
          if (
            !evidence.rosterMemberIds.includes(meeting.chairMemberId) ||
            !evidence.rosterMemberIds.includes(meeting.secretaryMemberId)
          ) {
            throw new DomainError("meeting_officers_required", 409);
          }
          const physicallyPresentMemberIds = new Set(
            evidence.attendance.filter((item) => item.status === "present").map((item) => item.memberId),
          );
          if (
            !physicallyPresentMemberIds.has(meeting.chairMemberId) ||
            !physicallyPresentMemberIds.has(meeting.secretaryMemberId)
          ) {
            throw new DomainError("meeting_officers_required", 409);
          }
        }
        if (status === "closed") await releaseOpenTopics(meetingId, "postponed");
        if (status === "cancelled") await releaseOpenTopics(meetingId, "withdrawn");
        await councilMeetingRepository.setStatus(meetingId, status);
        if (status === "closed" && meeting.status === "inProgress") {
          const existing = await topicRepository.findMinutesApprovalForMeeting(meetingId);
          if (!existing) {
            await topicRepository.create({
              kind: "minutesApproval",
              minutesOfMeetingId: meetingId,
              title: `Approbation du procès-verbal — ${meeting.title}`,
              report: "",
              folderPath: "",
              resourceIds: [],
            });
          }
        }
        return (await councilMeetingRepository.find(meetingId))!;
      });
    },
    async recordQuorumFailure(meetingId) {
      return unitOfWork.execute(async () => {
        const meeting = await requireMeeting(councilMeetingRepository, meetingId);
        if (meeting.status !== "scheduled" || meeting.quorumFailure) {
          throw new DomainError("invalid_meeting_transition", 409);
        }
        const evidence = await participationForMeeting(meeting, meetingRosterRepository, attendanceRepository);
        if (!isAttendanceComplete(evidence)) {
          throw new DomainError("attendance_incomplete", 409);
        }
        if (evidence.quorum.reached) throw new DomainError("invalid_meeting_transition", 409);
        await councilMeetingRepository.recordQuorumFailure(meetingId, {
          ...evidence,
          recordedAt: new Date().toISOString(),
        });
        return (await councilMeetingRepository.find(meetingId))!;
      });
    },
    async reconveneMeeting(previousMeetingId, input) {
      return unitOfWork.execute(async () => {
        const previousMeeting = await requireMeeting(councilMeetingRepository, previousMeetingId);
        if (previousMeeting.isReconvenedMeeting || previousMeeting.status !== "scheduled") {
          throw new DomainError("invalid_meeting_transition", 409);
        }
        if (!previousMeeting.quorumFailure || previousMeeting.quorumFailure.quorum.reached) {
          throw new DomainError("invalid_meeting_transition", 409);
        }
        const previousRoster = await meetingRosterRepository.listMemberIds(previousMeetingId);
        for (const officerId of [input.chairMemberId, input.secretaryMemberId]) {
          if (officerId && !previousRoster.includes(officerId)) {
            throw new DomainError("council_member_not_found", 409);
          }
        }
        if (transitionMeeting(previousMeeting.status, { type: "CLOSE_AFTER_QUORUM_FAILURE" }) !== "closed") {
          throw new DomainError("invalid_meeting_transition", 409);
        }
        await councilMeetingRepository.setStatus(previousMeetingId, "closed");
        const meeting = await councilMeetingRepository.create({
          ...input,
          isReconvenedMeeting: true,
          previousMeetingId,
        });
        await meetingRosterRepository.copy(previousMeetingId, meeting.id);
        await agendaRepository.copy(previousMeetingId, meeting.id);
        await agendaRepository.completeOpenItems(previousMeetingId, "postponed", new Date().toISOString());
        if (transitionMeeting(meeting.status, { type: "SCHEDULE" }) !== "scheduled") {
          throw new DomainError("invalid_meeting_transition", 409);
        }
        await councilMeetingRepository.setStatus(meeting.id, "scheduled");
        for (const item of await agendaRepository.listForMeeting(meeting.id)) {
          const topic = item.topic;
          if (transitionTopic(topic.state, { type: "RESCHEDULE" }) !== "scheduled") {
            throw new DomainError("agenda_inconsistent", 409);
          }
          await topicRepository.schedule(topic.id, meeting.id, item.position);
        }
        return (await councilMeetingRepository.find(meeting.id))!;
      });
    },
  };
}
