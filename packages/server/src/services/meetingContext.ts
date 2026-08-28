import type { CouncilMeeting } from "@hall/domain";
import type {
  AttendanceRepository,
  CouncilMeetingRepository,
  MeetingRosterRepository,
} from "../repositories/contracts.js";
import { DomainError } from "./errors.js";
import { buildParticipationEvidence } from "./participationEvidence.js";

export async function requireMeeting(repository: CouncilMeetingRepository, meetingId: string): Promise<CouncilMeeting> {
  const meeting = await repository.find(meetingId);
  if (!meeting) throw new DomainError("meeting_not_found", 404);
  return meeting;
}

export async function quorumForMeeting(
  meeting: CouncilMeeting,
  meetingRosterRepository: MeetingRosterRepository,
  attendanceRepository: AttendanceRepository,
) {
  return (await participationForMeeting(meeting, meetingRosterRepository, attendanceRepository)).quorum;
}

export async function participationForMeeting(
  meeting: CouncilMeeting,
  meetingRosterRepository: MeetingRosterRepository,
  attendanceRepository: AttendanceRepository,
) {
  const [memberIds, attendance] = await Promise.all([
    meetingRosterRepository.listMemberIds(meeting.id),
    attendanceRepository.listForMeeting(meeting.id),
  ]);
  return buildParticipationEvidence(memberIds, attendance, meeting.isReconvenedMeeting);
}
