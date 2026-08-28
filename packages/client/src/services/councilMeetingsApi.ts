import type { Ballot, CouncilMeeting, MeetingAggregate, MeetingStatus, VoteInput } from "@hall/domain";
import { apiRequest, apiSirenRequest, submitSirenActionAt } from "./apiClient";

export const listCouncilMeetings = () => apiRequest<CouncilMeeting[]>("/council-meetings");
export const createCouncilMeeting = (input: Record<string, unknown>) =>
  submitSirenActionAt<CouncilMeeting>("/council-meetings", "meeting.create", input).then((result) => result.data);
export const getCouncilMeeting = (meetingId: string) => apiRequest<MeetingAggregate>(`/council-meetings/${meetingId}`);
export const getCouncilMeetingSiren = (meetingId: string) =>
  apiSirenRequest<MeetingAggregate>(`/council-meetings/${meetingId}`);
export const updateCouncilMeeting = (meetingId: string, input: Record<string, unknown>) =>
  submitSirenActionAt<CouncilMeeting>(`/council-meetings/${meetingId}`, "meeting.update", input).then(
    (result) => result.data,
  );
export const recordMeetingAttendance = (meetingId: string, input: Record<string, unknown>) =>
  submitSirenActionAt(`/council-meetings/${meetingId}`, "meeting.record-attendance", input).then(
    (result) => result.data,
  );
export const deleteMeetingAgendaItem = (meetingId: string, itemId: string) =>
  submitSirenActionAt(`/council-meetings/${meetingId}/agenda-items/${itemId}`, "agenda-item.remove").then(
    (result) => result.data,
  );
export const reorderMeetingAgenda = (meetingId: string, itemIds: string[]) =>
  submitSirenActionAt(`/council-meetings/${meetingId}`, "meeting.reorder-agenda", { itemIds }).then(
    (result) => result.data,
  );
export const startMeetingAgendaItem = (meetingId: string, itemId: string) =>
  submitSirenActionAt(`/council-meetings/${meetingId}/agenda-items/${itemId}`, "agenda-item.start").then(
    (result) => result.data,
  );
export const saveMeetingAgendaItemNotes = (meetingId: string, itemId: string, discussionSummary: string) =>
  submitSirenActionAt(`/council-meetings/${meetingId}/agenda-items/${itemId}`, "agenda-item.save-notes", {
    discussionSummary,
  }).then((result) => result.data);
export const completeMeetingAgendaItem = (meetingId: string, itemId: string, input: Record<string, unknown>) =>
  submitSirenActionAt(`/council-meetings/${meetingId}/agenda-items/${itemId}`, "agenda-item.complete", input).then(
    (result) => result.data,
  );
export const changeMeetingStatus = (meetingId: string, status: MeetingStatus) =>
  submitSirenActionAt<CouncilMeeting>(
    `/council-meetings/${meetingId}`,
    status === "scheduled"
      ? "meeting.schedule"
      : status === "inProgress"
        ? "meeting.open"
        : status === "closed"
          ? "meeting.close"
          : "meeting.cancel",
    { status },
  ).then((result) => result.data);
export const setMeetingOfficers = (meetingId: string, input: Record<string, unknown>) =>
  submitSirenActionAt<CouncilMeeting>(`/council-meetings/${meetingId}`, "meeting.set-officers", input).then(
    (result) => result.data,
  );
export const recordMeetingQuorumFailure = (meetingId: string) =>
  submitSirenActionAt<CouncilMeeting>(`/council-meetings/${meetingId}`, "meeting.record-quorum-failure").then(
    (result) => result.data,
  );
export type BallotTarget = { councilDecisionId: string } | { agendaItemId: string };
export type RecordBallotInput = BallotTarget &
  (
    | { method: "public"; idempotencyKey: string; votes: VoteInput[] }
    | {
        method: "secret";
        idempotencyKey: string;
        totals: { votesFor: number; votesAgainst: number; abstentions: number; notVoting: number };
      }
  );
export const cancelMeetingBallot = (meetingId: string, ballotId: string) =>
  submitSirenActionAt(`/council-meetings/${meetingId}/ballots/${ballotId}`, "ballot.cancel").then(
    (result) => result.data,
  );
export const recordMeetingBallot = (meetingId: string, input: RecordBallotInput) =>
  submitSirenActionAt<Ballot>(`/council-meetings/${meetingId}`, "ballot.record", input).then((result) => result.data);
export const reconveneCouncilMeeting = (meetingId: string, input: Record<string, unknown>) =>
  submitSirenActionAt<CouncilMeeting>(`/council-meetings/${meetingId}`, "meeting.reconvene", input).then(
    (result) => result.data,
  );

export const createLateMeetingTopic = (meetingId: string, input: Record<string, unknown>) =>
  submitSirenActionAt(`/council-meetings/${meetingId}`, "meeting.add-late-topic", input).then((result) => result.data);
