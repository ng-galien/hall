import type {
  Ballot,
  BallotParticipation,
  BallotResultPreview,
  BallotVote,
  CreateBallotResultPreview,
} from "@hall/api-contract";
import { type CouncilClient, CouncilClientError } from "../clients/councilClient.js";
import { DomainError } from "./errors.js";

function translateFailure(error: unknown): never {
  if (error instanceof CouncilClientError) throw new DomainError("conflict", 409);
  throw error;
}

export interface CouncilBallotService {
  preview(input: CreateBallotResultPreview): Promise<BallotResultPreview>;
  getPreview(id: string): Promise<BallotResultPreview>;
  confirmPreview(id: string, confirmedAt?: string): Promise<Ballot>;

  listForMeeting(meetingId: string): Promise<Ballot[]>;
  get(ballotId: string): Promise<Ballot>;
  listParticipations(ballotId: string): Promise<BallotParticipation[]>;
  listVotes(ballotId: string): Promise<BallotVote[]>;
}

export function createCouncilBallotService({ councilClient }: { councilClient: CouncilClient }): CouncilBallotService {
  async function get(ballotId: string): Promise<Ballot> {
    const ballot = await councilClient.openBallot(ballotId).catch(translateFailure);
    if (!ballot) throw new DomainError("ballot_not_found", 404);
    return ballot;
  }

  return {
    preview: (input) => councilClient.createBallotResultPreview(input).catch(translateFailure),
    async getPreview(id) {
      const preview = await councilClient.openBallotResultPreview(id).catch(translateFailure);
      if (!preview) throw new DomainError("ballot_preview_not_found", 404);
      return preview;
    },
    confirmPreview: (id, confirmedAt) =>
      councilClient.confirmBallotResultPreview(id, confirmedAt).catch(translateFailure),
    listForMeeting: (meetingId) => councilClient.listBallots(meetingId).catch(translateFailure),
    get,
    async listParticipations(ballotId) {
      await get(ballotId);
      return councilClient.listBallotParticipations(ballotId).catch(translateFailure);
    },
    async listVotes(ballotId) {
      await get(ballotId);
      return councilClient.listBallotVotes(ballotId).catch(translateFailure);
    },
  };
}
