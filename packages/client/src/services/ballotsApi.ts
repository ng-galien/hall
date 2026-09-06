import {
  ballotParticipationSchema,
  ballotSchema,
  ballotVoteSchema,
  completeBallotSchema,
  createBallotSchema,
  recordBallotVotesSchema,
  type CompleteBallot,
  type CreateBallot,
  type RecordBallotVotes,
} from "@hall/api-contract";
import { apiRequest, apiSirenRequest, submitSirenActionAt } from "./apiClient";

export async function listMeetingBallots(meetingId: string) {
  return ballotSchema.array().parse(await apiRequest<unknown>(`/ballots?meetingId=${encodeURIComponent(meetingId)}`));
}

export async function listBallotParticipations(ballotId: string) {
  return ballotParticipationSchema
    .array()
    .parse(await apiRequest<unknown>(`/ballots/${encodeURIComponent(ballotId)}/participations`));
}

export async function listBallotVotes(ballotId: string) {
  return ballotVoteSchema
    .array()
    .parse(await apiRequest<unknown>(`/ballots/${encodeURIComponent(ballotId)}/votes`));
}

export async function createBallot(meetingId: string, input: CreateBallot) {
  const collectionPath = `/ballots?meetingId=${encodeURIComponent(meetingId)}`;
  await apiSirenRequest(collectionPath);
  const result = await submitSirenActionAt<unknown>(collectionPath, "ballot.create", createBallotSchema.parse(input));
  return ballotSchema.parse(result.data);
}

export async function recordBallotVotes(ballotId: string, input: RecordBallotVotes) {
  const path = `/ballots/${encodeURIComponent(ballotId)}`;
  await apiSirenRequest(path);
  const result = await submitSirenActionAt<unknown>(path, "ballot.record-votes", recordBallotVotesSchema.parse(input));
  return ballotVoteSchema.array().parse(result.data);
}

export async function completeBallot(ballotId: string, input: CompleteBallot) {
  const path = `/ballots/${encodeURIComponent(ballotId)}`;
  await apiSirenRequest(path);
  const result = await submitSirenActionAt<unknown>(path, "ballot.complete", completeBallotSchema.parse(input));
  return ballotSchema.parse(result.data);
}
