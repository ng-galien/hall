import {
  ballotParticipationSchema,
  ballotSchema,
  ballotVoteSchema,
  ballotResultPreviewSchema,
  createBallotResultPreviewSchema,
  type CreateBallotResultPreview,
} from "@hall/api-contract";
import { apiRequest, submitSirenActionAt, submitSirenAction } from "./apiClient";

export async function listMeetingBallots(meetingId: string) {
  return ballotSchema.array().parse(await apiRequest<unknown>(`/ballots?meetingId=${encodeURIComponent(meetingId)}`));
}

export async function listBallotParticipations(ballotId: string) {
  return ballotParticipationSchema
    .array()
    .parse(await apiRequest<unknown>(`/ballots/${encodeURIComponent(ballotId)}/participations`));
}

export async function listBallotVotes(ballotId: string) {
  return ballotVoteSchema.array().parse(await apiRequest<unknown>(`/ballots/${encodeURIComponent(ballotId)}/votes`));
}

export async function previewBallot(meetingReference: string, input: CreateBallotResultPreview) {
  const path = `/council-meetings/${encodeURIComponent(meetingReference)}/agenda-items/${encodeURIComponent(input.agendaItemId)}`;
  const result = await submitSirenActionAt<unknown>(
    path,
    "ballot.preview",
    createBallotResultPreviewSchema.parse(input),
  );
  if (!result.representation) throw new Error("The ballot preview requires its Siren representation");
  return { data: ballotResultPreviewSchema.parse(result.data), representation: result.representation };
}

export type BallotPreview = Awaited<ReturnType<typeof previewBallot>>;
export async function openBallotResultPreview(id: string) {
  return ballotResultPreviewSchema.parse(await apiRequest<unknown>(`/ballot-previews/${encodeURIComponent(id)}`));
}

export async function confirmBallot(preview: BallotPreview) {
  const result = await submitSirenAction<unknown>(preview.representation, "ballot.confirm", {});
  return ballotSchema.parse(result.data);
}
