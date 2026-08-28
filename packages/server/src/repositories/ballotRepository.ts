import { randomUUID } from "node:crypto";
import type { Ballot, Vote } from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { BallotRepository } from "./contracts.js";
import { parseParticipationEvidence } from "./evidenceMapping.js";
import { asBoolean, asNullableString, type DatabaseRow, mapSequential } from "./row.js";

function jsonArray(value: unknown): string[] {
  return (typeof value === "string" ? JSON.parse(value) : (value ?? [])) as string[];
}
async function mapBallot(sqlExecutor: SqlExecutor, row: DatabaseRow): Promise<Ballot> {
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
    chairTieBreakApplied: asBoolean(row.chair_tie_break_applied),
    recusedMemberIds: jsonArray(row.recused_member_ids_json),
    participationEvidence: parseParticipationEvidence(row.participation_evidence_json),
    createdAt: String(row.created_at),
    cancelledAt: asNullableString(row.cancelled_at),
  };
  if (row.method === "secret") return { ...common, method: "secret" };
  const votes = (await sqlExecutor.all("ballot.votes", { ballotId: common.id })).map(
    (vote): Vote => ({
      id: String(vote.id),
      ballotId: String(vote.ballot_id),
      memberId: String(vote.member_id),
      castByMemberId: String(vote.cast_by_member_id),
      choice: vote.choice as Vote["choice"],
    }),
  );
  return { ...common, method: "public", votes };
}

export function createBallotRepository({ sqlExecutor }: { sqlExecutor: SqlExecutor }): BallotRepository {
  const mapped = async (
    name: "ballot.findFinalByDecision" | "ballot.findById" | "ballot.findByAgendaItem" | "ballot.findByIdempotencyKey",
    parameters: Record<string, string>,
  ) => {
    const row = await sqlExecutor.get(name, parameters);
    return row ? { row, ballot: await mapBallot(sqlExecutor, row) } : null;
  };
  return {
    async listForMeeting(meetingId) {
      const rows = await sqlExecutor.all("ballot.listByMeeting", { meetingId });
      return mapSequential(rows, (row) => mapBallot(sqlExecutor, row));
    },
    async findFinalForDecision(councilDecisionId) {
      return (await mapped("ballot.findFinalByDecision", { councilDecisionId }))?.ballot ?? null;
    },
    async findById(ballotId) {
      return (await mapped("ballot.findById", { ballotId }))?.ballot ?? null;
    },
    cancel(ballotId, cancelledAt) {
      return sqlExecutor.run("ballot.cancel", { ballotId, cancelledAt }).then(() => undefined);
    },
    async findForAgendaItem(agendaItemId) {
      return (await mapped("ballot.findByAgendaItem", { agendaItemId }))?.ballot ?? null;
    },
    async findByIdempotencyKey(idempotencyKey) {
      const found = await mapped("ballot.findByIdempotencyKey", { idempotencyKey });
      return found ? { ballot: found.ballot, commandFingerprint: String(found.row.command_fingerprint) } : null;
    },
    recordFinal(input) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        const createdAt = new Date().toISOString();
        const insert = await sqlExecutor.run("ballot.insert", {
          id,
          meetingId: input.meetingId,
          councilDecisionId: input.councilDecisionId,
          agendaItemId: input.agendaItemId,
          idempotencyKey: input.idempotencyKey,
          commandFingerprint: input.commandFingerprint,
          method: input.method,
          result: input.result,
          votesFor: input.votesFor,
          votesAgainst: input.votesAgainst,
          abstentions: input.abstentions,
          notVoting: input.notVoting,
          chairTieBreakApplied: input.chairTieBreakApplied,
          recusedMemberIdsJson: JSON.stringify(input.recusedMemberIds),
          participationEvidenceJson: JSON.stringify(input.participationEvidence),
          createdAt,
        });
        if (insert.changes === 0) {
          const replay = await mapped("ballot.findByIdempotencyKey", { idempotencyKey: input.idempotencyKey });
          if (replay)
            return String(replay.row.command_fingerprint) === input.commandFingerprint
              ? { status: "replayed" as const, ballot: replay.ballot }
              : { status: "idempotencyConflict" as const };
          const claimed = input.councilDecisionId
            ? await sqlExecutor.get("ballot.targetClaimedByDecision", { councilDecisionId: input.councilDecisionId })
            : await sqlExecutor.get("ballot.targetClaimedByAgendaItem", { agendaItemId: input.agendaItemId! });
          if (claimed) return { status: "decisionAlreadyFinalized" as const };
          throw new Error("Ballot insert was ignored without a known repository conflict");
        }
        for (const [index, vote] of input.votes.entries())
          await sqlExecutor.run("ballot.insertVote", {
            id: randomUUID(),
            ballotId: id,
            memberId: vote.memberId,
            castByMemberId: vote.castByMemberId,
            choice: vote.choice,
            position: index + 1,
          });
        return {
          status: "created" as const,
          ballot: await mapBallot(sqlExecutor, (await sqlExecutor.get("ballot.findById", { ballotId: id }))!),
        };
      });
    },
  };
}
