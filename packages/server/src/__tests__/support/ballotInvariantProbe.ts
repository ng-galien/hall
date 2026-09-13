import { matchDiscriminated } from "@hall/domain";
import { Pool } from "pg";
import type { DatabaseConfig } from "../../core/config.js";
import { translatePersistenceError } from "../../infrastructure/database/errors.js";

export type BallotProbeMutation =
  | { kind: "moveVote"; ballotId: string; voteId: string }
  | { kind: "setMethod"; ballotId: string; method: "public" | "secret" };

export async function runBallotProbe(database: DatabaseConfig, mutation: BallotProbeMutation): Promise<void> {
  try {
    const pool = new Pool({ connectionString: database.url, max: 1 });
    try {
      await matchDiscriminated(mutation, "kind", {
        moveVote: ({ ballotId, voteId }) =>
          pool.query("UPDATE votes SET ballot_id = $1 WHERE id = $2", [ballotId, voteId]),
        setMethod: ({ ballotId, method }) =>
          pool.query("UPDATE ballots SET method = $1 WHERE id = $2", [method, ballotId]),
      });
    } finally {
      await pool.end();
    }
  } catch (error) {
    throw translatePersistenceError(error);
  }
}
