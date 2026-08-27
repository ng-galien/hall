import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Ballot, Vote } from "@mairie/domain";
import type { SqliteExecutor } from "../infrastructure/sqlite/executor.js";
import type { BallotRepository } from "./contracts.js";
import { parseParticipationEvidence } from "./evidenceMapping.js";
import { asNullableString, type DatabaseRow } from "./row.js";

function mapVotes(database: DatabaseSync, ballotId: string): Vote[] {
  return database
    .prepare("SELECT * FROM votes WHERE ballot_id = ? ORDER BY rowid")
    .all(ballotId)
    .map((row) => ({
      id: String(row.id),
      ballotId: String(row.ballot_id),
      memberId: String(row.member_id),
      castByMemberId: String(row.cast_by_member_id),
      choice: row.choice as Vote["choice"],
    }));
}

function mapBallot(database: DatabaseSync, row: DatabaseRow): Ballot {
  const common = {
    id: String(row.id),
    meetingId: String(row.meeting_id),
    councilDecisionId: asNullableString(row.council_decision_id),
    agendaItemId: asNullableString(row.agenda_item_id),
    result: row.result as Ballot["result"],
    votesFor: Number(row.votes_for),
    votesAgainst: Number(row.votes_against),
    abstentions: Number(row.abstentions),
    notVoting: Number(row.not_voting),
    votesCast: Number(row.votes_for) + Number(row.votes_against),
    chairTieBreakApplied: row.chair_tie_break_applied === 1,
    recusedMemberIds: JSON.parse(String(row.recused_member_ids_json ?? "[]")) as string[],
    participationEvidence: parseParticipationEvidence(row.participation_evidence_json),
    createdAt: String(row.created_at),
    cancelledAt: asNullableString(row.cancelled_at),
  };
  return row.method === "public"
    ? { ...common, method: "public", votes: mapVotes(database, common.id) }
    : { ...common, method: "secret" };
}

export function createBallotRepository({ sqliteExecutor }: { sqliteExecutor: SqliteExecutor }): BallotRepository {
  return {
    listForMeeting(meetingId) {
      return sqliteExecutor.run((database) =>
        database
          .prepare("SELECT * FROM ballots WHERE meeting_id = ? ORDER BY created_at")
          .all(meetingId)
          .map((row) => mapBallot(database, row)),
      );
    },
    findFinalForDecision(councilDecisionId) {
      return sqliteExecutor.run((database) => {
        const row = database
          .prepare("SELECT * FROM ballots WHERE council_decision_id = ? AND cancelled_at IS NULL")
          .get(councilDecisionId);
        return row ? mapBallot(database, row) : null;
      });
    },
    findById(ballotId) {
      return sqliteExecutor.run((database) => {
        const row = database.prepare("SELECT * FROM ballots WHERE id = ?").get(ballotId);
        return row ? mapBallot(database, row) : null;
      });
    },
    cancel(ballotId, cancelledAt) {
      return sqliteExecutor.run((database) => {
        database
          .prepare("UPDATE ballots SET cancelled_at = ? WHERE id = ? AND cancelled_at IS NULL")
          .run(cancelledAt, ballotId);
      });
    },
    findForAgendaItem(agendaItemId) {
      return sqliteExecutor.run((database) => {
        const row = database
          .prepare("SELECT * FROM ballots WHERE agenda_item_id = ? AND cancelled_at IS NULL")
          .get(agendaItemId);
        return row ? mapBallot(database, row) : null;
      });
    },
    findByIdempotencyKey(idempotencyKey) {
      return sqliteExecutor.run((database) => {
        const row = database.prepare("SELECT * FROM ballots WHERE idempotency_key = ?").get(idempotencyKey);
        return row ? { ballot: mapBallot(database, row), commandFingerprint: String(row.command_fingerprint) } : null;
      });
    },
    recordFinal(input) {
      return sqliteExecutor.run((database) => {
        const id = randomUUID();
        const now = new Date().toISOString();
        const insertResult = database
          .prepare(`INSERT INTO ballots
            (id, meeting_id, council_decision_id, agenda_item_id, idempotency_key, command_fingerprint, method, result, votes_for, votes_against, abstentions, not_voting, chair_tie_break_applied, recused_member_ids_json, participation_evidence_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT DO NOTHING`)
          .run(
            id,
            input.meetingId,
            input.councilDecisionId,
            input.agendaItemId,
            input.idempotencyKey,
            input.commandFingerprint,
            input.method,
            input.result,
            input.votesFor,
            input.votesAgainst,
            input.abstentions,
            input.notVoting,
            input.chairTieBreakApplied ? 1 : 0,
            JSON.stringify(input.recusedMemberIds),
            JSON.stringify(input.participationEvidence),
            now,
          );
        if (insertResult.changes === 0) {
          const idempotentRow = database
            .prepare("SELECT * FROM ballots WHERE idempotency_key = ?")
            .get(input.idempotencyKey);
          if (idempotentRow) {
            if (String(idempotentRow.command_fingerprint) !== input.commandFingerprint) {
              return { status: "idempotencyConflict" };
            }
            return { status: "replayed", ballot: mapBallot(database, idempotentRow) };
          }
          const claimedTarget = input.councilDecisionId
            ? database
                .prepare("SELECT 1 FROM ballots WHERE council_decision_id = ? AND cancelled_at IS NULL")
                .get(input.councilDecisionId)
            : database
                .prepare("SELECT 1 FROM ballots WHERE agenda_item_id = ? AND cancelled_at IS NULL")
                .get(input.agendaItemId);
          if (claimedTarget) return { status: "decisionAlreadyFinalized" };
          throw new Error("Ballot insert was ignored without a known repository conflict");
        }
        const insertVote = database.prepare(
          "INSERT INTO votes (id, ballot_id, member_id, cast_by_member_id, choice) VALUES (?, ?, ?, ?, ?)",
        );
        for (const vote of input.votes) {
          insertVote.run(randomUUID(), id, vote.memberId, vote.castByMemberId, vote.choice);
        }
        return {
          status: "created",
          ballot: mapBallot(database, database.prepare("SELECT * FROM ballots WHERE id = ?").get(id)!),
        };
      });
    },
  };
}
