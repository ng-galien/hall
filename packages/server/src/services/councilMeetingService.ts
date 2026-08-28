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
  UnitOfWork,
} from "../repositories/contracts.js";
import { DomainError } from "./errors.js";
import { requireMeeting } from "./meetingContext.js";

export interface CouncilMeetingService {
  listMeetings(): Promise<CouncilMeeting[]>;
  createMeeting(input: CreateCouncilMeeting): Promise<CouncilMeeting & { activeMemberCount: number }>;
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
  unitOfWork,
}: {
  councilMeetingRepository: CouncilMeetingRepository;
  councilMemberRepository: CouncilMemberRepository;
  meetingRosterRepository: MeetingRosterRepository;
  attendanceRepository: AttendanceRepository;
  agendaRepository: AgendaRepository;
  councilDecisionRepository: CouncilDecisionRepository;
  ballotRepository: BallotRepository;
  unitOfWork: UnitOfWork;
}): CouncilMeetingService {
  return {
    listMeetings: () => councilMeetingRepository.list(),
    async createMeeting(input) {
      return unitOfWork.execute(async () => {
        for (const memberId of [input.chairMemberId, input.secretaryMemberId]) {
          if (!memberId) continue;
          const member = await councilMemberRepository.find(memberId);
          if (!member?.active) throw new DomainError("council_member_not_found", 404);
        }
        const meeting = await councilMeetingRepository.create({
          ...input,
          isReconvenedMeeting: false,
          previousMeetingId: null,
        });
        return { ...meeting, activeMemberCount: (await councilMemberRepository.listActive()).length };
      });
    },
    async updateMeeting(meetingId, input) {
      return unitOfWork.execute(async () => {
        const meeting = await requireMeeting(councilMeetingRepository, meetingId);
        if (!["draft", "scheduled"].includes(meeting.status) || meeting.quorumFailure) {
          throw new DomainError("invalid_meeting_transition", 409);
        }
        await councilMeetingRepository.updateDetails(meetingId, input);
        return (await councilMeetingRepository.find(meetingId))!;
      });
    },
    async getMeeting(meetingId) {
      const meeting = await requireMeeting(councilMeetingRepository, meetingId);
      const [attendance, agendaItems, allCouncilDecisions, ballots, memberIds, activeMembers] = await Promise.all([
        attendanceRepository.listForMeeting(meetingId),
        agendaRepository.listForMeeting(meetingId),
        councilDecisionRepository.list(),
        ballotRepository.listForMeeting(meetingId),
        meetingRosterRepository.listMemberIds(meetingId),
        councilMemberRepository.listActive(),
      ]);
      const councilDecisionIds = new Set(
        agendaItems.flatMap((item) =>
          item.topic.kind === "subject" && item.topic.councilDecisionId ? [item.topic.councilDecisionId] : [],
        ),
      );
      return {
        meeting,
        activeMemberCount: activeMembers.length,
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
