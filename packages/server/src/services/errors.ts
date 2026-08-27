export type ErrorCode =
  | "agenda_ballot_required"
  | "agenda_inconsistent"
  | "agenda_item_not_found"
  | "agenda_sequence_invalid"
  | "attendance_incomplete"
  | "ballot_already_recorded"
  | "ballot_not_found"
  | "ballot_voters_invalid"
  | "conflict"
  | "council_decision_not_found"
  | "council_member_not_found"
  | "invalid_request"
  | "invalid_meeting_transition"
  | "meeting_not_found"
  | "meeting_officers_required"
  | "meeting_roster_locked"
  | "proxy_invalid"
  | "quorum_not_reached"
  | "resource_content_unavailable"
  | "resource_not_found"
  | "topic_not_found";

export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly statusCode = 400,
    message = code,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
