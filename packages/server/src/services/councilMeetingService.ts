import { type CouncilMeeting, calculateQuorum, type MeetingAggregate } from "@hall/domain";
import type {
  AgendaItemRepository,
  AttendanceRepository,
  BallotRepository,
  CouncilDecisionRepository,
  CouncilMeetingRepository,
  CouncilMemberRepository,
  CreateCouncilMeeting,
  MeetingRosterRepository,
  UnitOfWork,
} from "../repositories/contracts.js";
import { agendaReadiness } from "./agendaOrderPolicy.js";
import { DomainError } from "./errors.js";
import { requireMeeting } from "./meetingContext.js";

export interface CouncilMeetingService {
  listMeetings(): Promise<CouncilMeeting[]>;
  createMeeting(input: CreateCouncilMeeting): Promise<
    CouncilMeeting & {
      activeMemberCount: number;
      agendaReady: boolean;
      requiredMinutesOfMeetingId: string | null;
    }
  >;
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
  agendaItemRepository,
  councilDecisionRepository,
  ballotRepository,
  unitOfWork,
}: {
  councilMeetingRepository: CouncilMeetingRepository;
  councilMemberRepository: CouncilMemberRepository;
  meetingRosterRepository: MeetingRosterRepository;
  attendanceRepository: AttendanceRepository;
  agendaItemRepository: AgendaItemRepository;
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
        return {
          ...meeting,
          activeMemberCount: (await councilMemberRepository.listActive()).length,
          ...agendaReadiness(meeting, [], await councilMeetingRepository.list()),
        };
      });
    },
    async updateMeeting(meetingId, input) {
      return unitOfWork.execute(async () => {
        const meeting = await requireMeeting(councilMeetingRepository, meetingId);
        if (!["draft", "scheduled"].includes(meeting.status) || meeting.quorumFailure) {
          throw new DomainError("invalid_meeting_transition", 409);
        }
        if (meeting.startsAt.slice(0, 10) !== input.startsAt.slice(0, 10)) {
          throw new DomainError("invalid_meeting_transition", 409);
        }
        await councilMeetingRepository.updateDetails(meeting.id, input);
        return (await councilMeetingRepository.find(meeting.id))!;
      });
    },
    async getMeeting(meetingId) {
      const meeting = await requireMeeting(councilMeetingRepository, meetingId);
      const id = meeting.id;
      const [attendance, agendaItems, allCouncilDecisions, ballots, memberIds, activeMembers, meetings] =
        await Promise.all([
          attendanceRepository.listForMeeting(id),
          agendaItemRepository.listForMeeting(id),
          councilDecisionRepository.list(),
          ballotRepository.listForMeeting(id),
          meetingRosterRepository.listMemberIds(id),
          councilMemberRepository.listActive(),
          councilMeetingRepository.list(),
        ]);
      const councilDecisionIds = new Set(
        agendaItems.flatMap((item) =>
          item.business.kind === "matter" && item.business.councilDecisionId ? [item.business.councilDecisionId] : [],
        ),
      );
      return {
        meeting,
        ...agendaReadiness(meeting, agendaItems, meetings),
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
