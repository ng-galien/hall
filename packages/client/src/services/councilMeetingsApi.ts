import type { Ballot, CouncilMeeting, MeetingAggregate, MeetingStatus, VoteInput } from "@mairie/domain";
import { apiRequest } from "./apiClient";

export const listCouncilMeetings = () => apiRequest<CouncilMeeting[]>("/council-meetings");
export const createCouncilMeeting = (input: Record<string, unknown>) =>
  apiRequest<CouncilMeeting>("/council-meetings", { method: "POST", body: JSON.stringify(input) });
export const getCouncilMeeting = (meetingId: string) => apiRequest<MeetingAggregate>(`/council-meetings/${meetingId}`);
export const updateCouncilMeeting = (meetingId: string, input: Record<string, unknown>) =>
  apiRequest<CouncilMeeting>(`/council-meetings/${meetingId}`, { method: "PUT", body: JSON.stringify(input) });
export const recordMeetingAttendance = (meetingId: string, input: Record<string, unknown>) =>
  apiRequest(`/council-meetings/${meetingId}/attendance`, { method: "PUT", body: JSON.stringify(input) });
export const createMeetingAgendaItem = (meetingId: string, input: Record<string, unknown>) =>
  apiRequest(`/council-meetings/${meetingId}/agenda-items`, { method: "POST", body: JSON.stringify(input) });
export const updateMeetingAgendaItem = (meetingId: string, itemId: string, input: Record<string, unknown>) =>
  apiRequest(`/council-meetings/${meetingId}/agenda-items/${itemId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
export const deleteMeetingAgendaItem = (meetingId: string, itemId: string) =>
  apiRequest(`/council-meetings/${meetingId}/agenda-items/${itemId}`, { method: "DELETE" });
export const reorderMeetingAgenda = (meetingId: string, itemIds: string[]) =>
  apiRequest(`/council-meetings/${meetingId}/agenda-order`, { method: "PUT", body: JSON.stringify({ itemIds }) });
export const startMeetingAgendaItem = (meetingId: string, itemId: string) =>
  apiRequest(`/council-meetings/${meetingId}/agenda-items/${itemId}/start`, { method: "POST" });
export const saveMeetingAgendaItemNotes = (meetingId: string, itemId: string, discussionSummary: string) =>
  apiRequest(`/council-meetings/${meetingId}/agenda-items/${itemId}/notes`, {
    method: "PUT",
    body: JSON.stringify({ discussionSummary }),
  });
export const completeMeetingAgendaItem = (meetingId: string, itemId: string, input: Record<string, unknown>) =>
  apiRequest(`/council-meetings/${meetingId}/agenda-items/${itemId}/complete`, {
    method: "POST",
    body: JSON.stringify(input),
  });
export const changeMeetingStatus = (meetingId: string, status: MeetingStatus) =>
  apiRequest<CouncilMeeting>(`/council-meetings/${meetingId}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
export const setMeetingOfficers = (meetingId: string, input: Record<string, unknown>) =>
  apiRequest<CouncilMeeting>(`/council-meetings/${meetingId}/officers`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
export const recordMeetingQuorumFailure = (meetingId: string) =>
  apiRequest<CouncilMeeting>(`/council-meetings/${meetingId}/quorum-failure`, { method: "POST" });
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
  apiRequest(`/council-meetings/${meetingId}/ballots/${ballotId}`, { method: "DELETE" });
export const recordMeetingBallot = (meetingId: string, input: RecordBallotInput) =>
  apiRequest<Ballot>(`/council-meetings/${meetingId}/ballots`, { method: "POST", body: JSON.stringify(input) });
export const reconveneCouncilMeeting = (meetingId: string, input: Record<string, unknown>) =>
  apiRequest<CouncilMeeting>(`/council-meetings/${meetingId}/reconvene`, {
    method: "POST",
    body: JSON.stringify(input),
  });
