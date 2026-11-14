import type { MeetingProxyRegistration } from "@hall/api-contract";
import type { LiveMeetingMemberAttendance } from "../../models/liveMeeting";

/**
 * The roll call of the opening starts from the declared attendance and the proxies registered before the meeting: a
 * member who registered a proxy and has no declaration yet is represented by the holder, with the registered document.
 * The opening validates the roll call with the server rules.
 * @implements-requirement HALL-FR-ATT-190
 */
export function withRegisteredProxies(
  attendance: readonly LiveMeetingMemberAttendance[],
  registrations: readonly MeetingProxyRegistration[],
  meetingId: string,
): LiveMeetingMemberAttendance[] {
  const declared = new Set(attendance.map((entry) => entry.memberId));
  return [
    ...attendance,
    ...registrations
      .filter((registration) => !declared.has(registration.grantorCouncilMemberId))
      .map((registration) => ({
        id: `draft-${registration.grantorCouncilMemberId}`,
        meetingId,
        memberId: registration.grantorCouncilMemberId,
        status: "represented" as const,
        proxyHolderMemberId: registration.holderCouncilMemberId,
        proxyDocumentId: registration.proxyDocumentId,
        version: 1,
      })),
  ];
}
