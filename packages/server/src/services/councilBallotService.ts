import type {
  Ballot,
  BallotParticipation,
  BallotVote,
  CompleteBallot,
  CreateBallot,
  RecordBallotVotes,
} from "@hall/api-contract";
import { type CouncilClient, CouncilClientError } from "../clients/councilClient.js";
import { DomainError } from "./errors.js";

function translateFailure(error: unknown): never {
  if (error instanceof CouncilClientError) throw new DomainError("conflict", 409);
  throw error;
}

export interface CouncilBallotService {
  listForMeeting(meetingId: string): Promise<Ballot[]>;
  get(ballotId: string): Promise<Ballot>;
  listParticipations(ballotId: string): Promise<BallotParticipation[]>;
  listVotes(ballotId: string): Promise<BallotVote[]>;
  create(input: CreateBallot): Promise<Ballot>;
  recordVotes(ballotId: string, input: RecordBallotVotes): Promise<BallotVote[]>;
  complete(ballotId: string, input: CompleteBallot): Promise<Ballot>;
}

export function createCouncilBallotService({
  councilClient,
}: {
  councilClient: CouncilClient;
}): CouncilBallotService {
  async function get(ballotId: string): Promise<Ballot> {
    const ballot = await councilClient.openBallot(ballotId).catch(translateFailure);
    if (!ballot) throw new DomainError("ballot_not_found", 404);
    return ballot;
  }

  return {
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
    create: (input) => councilClient.createBallot(input).catch(translateFailure),
    recordVotes: (ballotId, input) => councilClient.recordBallotVotes(ballotId, input).catch(translateFailure),
    complete: (ballotId, input) => councilClient.completeBallot(ballotId, input).catch(translateFailure),
  };
}
