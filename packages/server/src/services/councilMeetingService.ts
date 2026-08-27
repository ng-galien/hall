import { type CouncilMeeting, calculateQuorum, type MeetingAggregate } from "@mairie/domain";
import type {
  AgendaRepository,
  AttendanceRepository,
  BallotRepository,
  CouncilDecisionRepository,
  CouncilMeetingRepository,
  CouncilMemberRepository,
  CreateCouncilMeeting,
  MeetingRosterRepository,
} from "../repositories/contracts.js";
import { DomainError } from "./errors.js";
import { requireMeeting } from "./meetingContext.js";

export interface CouncilMeetingService {
  listMeetings(): Promise<CouncilMeeting[]>;
  createMeeting(input: CreateCouncilMeeting): Promise<CouncilMeeting>;
  updateMeeting(
    meetingId: string,
    input: { title: string; startsAt: string; location: string },
  ): Promise<CouncilMeeting>;
  getMeeting(meetingId: string): Promise<MeetingAggregate>;
}

export function createCouncilMeetingService({
  councilMeetingRepository,
  councilMemberRepository,
  meetingRosterRepository,
  attendanceRepository,
  agendaRepository,
  councilDecisionRepository,
  ballotRepository,
}: {
  councilMeetingRepository: CouncilMeetingRepository;
  councilMemberRepository: CouncilMemberRepository;
  meetingRosterRepository: MeetingRosterRepository;
  attendanceRepository: AttendanceRepository;
  agendaRepository: AgendaRepository;
  councilDecisionRepository: CouncilDecisionRepository;
  ballotRepository: BallotRepository;
}): CouncilMeetingService {
  return {
    listMeetings: () => councilMeetingRepository.list(),
    async createMeeting(input) {
      for (const memberId of [input.chairMemberId, input.secretaryMemberId]) {
        if (!memberId) continue;
        const member = await councilMemberRepository.find(memberId);
        if (!member?.active) throw new DomainError("council_member_not_found", 404);
      }
      return councilMeetingRepository.create({ ...input, isReconvenedMeeting: false, previousMeetingId: null });
    },
    async updateMeeting(meetingId, input) {
      const meeting = await requireMeeting(councilMeetingRepository, meetingId);
      if (!["draft", "scheduled"].includes(meeting.status) || meeting.quorumFailure) {
        throw new DomainError("invalid_meeting_transition", 409);
      }
      await councilMeetingRepository.updateDetails(meetingId, input);
      return (await councilMeetingRepository.find(meetingId))!;
    },
    async getMeeting(meetingId) {
      const meeting = await requireMeeting(councilMeetingRepository, meetingId);
      const [attendance, agendaItems, allCouncilDecisions, ballots, memberIds] = await Promise.all([
        attendanceRepository.listForMeeting(meetingId),
        agendaRepository.listForMeeting(meetingId),
        councilDecisionRepository.list(),
        ballotRepository.listForMeeting(meetingId),
        meetingRosterRepository.listMemberIds(meetingId),
      ]);
      const councilDecisionIds = new Set(
        agendaItems.flatMap((item) =>
          item.topic.kind === "subject" && item.topic.councilDecisionId ? [item.topic.councilDecisionId] : [],
        ),
      );
      return {
        meeting,
        rosterMemberIds: memberIds,
        attendance,
        agendaItems,
        councilDecisions: allCouncilDecisions.filter((item) => councilDecisionIds.has(item.id)),
        ballots,
        quorum: calculateQuorum(memberIds.length, attendance, meeting.isReconvenedMeeting),
      };
    },
  };
}
