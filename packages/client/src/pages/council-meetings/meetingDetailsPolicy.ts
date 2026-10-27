import type { PrepareCouncilMeeting, ScheduleCouncilMeeting } from "@hall/api-contract";
import type { TranslationKey } from "../../i18n/en";

export type MeetingDetailsField = "startsAt" | "location" | "chairMemberId" | "secretaryMemberId";

export interface MeetingDetailsDraft {
  /** Instant in the commune's time zone, or null when the entered local time is missing or does not exist. */
  scheduledAt: string | null;
  location: string;
  chairMemberId: string;
  secretaryMemberId: string;
}

export interface MeetingDetailsOfficers {
  chairMemberId: string | null;
  secretaryMemberId: string | null;
}

export type MeetingDetailsSubmission =
  | { kind: "schedule"; input: ScheduleCouncilMeeting }
  | { kind: "prepare"; input: PrepareCouncilMeeting }
  | { kind: "invalid"; errors: Partial<Record<MeetingDetailsField, TranslationKey>> };

/**
 * Chooses the meeting action for the general properties form. Date and location are saved alone while
 * the officers are still to be designated; the chair and the secretary are designated together.
 */
export function meetingDetailsSubmission(
  draft: MeetingDetailsDraft,
  recorded: MeetingDetailsOfficers,
): MeetingDetailsSubmission {
  const location = draft.location.trim();
  const chairMemberId = draft.chairMemberId.trim();
  const secretaryMemberId = draft.secretaryMemberId.trim();
  const errors: Partial<Record<MeetingDetailsField, TranslationKey>> = {};
  if (!draft.scheduledAt) errors.startsAt = "meetings.invalidLocalTime";
  if (!location) errors.location = "meetings.locationRequired";
  if (!chairMemberId && recorded.chairMemberId) errors.chairMemberId = "meetings.officerCannotBeRemoved";
  else if (!chairMemberId && secretaryMemberId) errors.chairMemberId = "meetings.officersDesignatedTogether";
  if (!secretaryMemberId && recorded.secretaryMemberId) errors.secretaryMemberId = "meetings.officerCannotBeRemoved";
  else if (!secretaryMemberId && chairMemberId) errors.secretaryMemberId = "meetings.officersDesignatedTogether";
  if (!draft.scheduledAt || Object.keys(errors).length) return { kind: "invalid", errors };
  const schedule = { scheduledAt: draft.scheduledAt, location };
  return chairMemberId && secretaryMemberId
    ? { kind: "prepare", input: { ...schedule, chairMemberId, secretaryMemberId } }
    : { kind: "schedule", input: schedule };
}
