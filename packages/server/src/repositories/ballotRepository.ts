import { randomUUID } from "node:crypto";
import {
  type Ballot,
  ballotMethodSchema,
  ballotResultSchema,
  ballotTargetOf,
  identifierListSchema,
  identifierSchema,
  matchLiteral,
  storedBallotTarget,
  type Vote,
  voteChoiceSchema,
} from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { BallotRepository } from "./contracts.js";
import { parseParticipationEvidence } from "./evidenceMapping.js";
import { asBoolean, asInteger, asNullableString, asString, type DatabaseRow, mapSequential } from "./row.js";

function jsonArray(value: unknown): string[] {
  return identifierListSchema.parse(typeof value === "string" ? JSON.parse(value) : value);
}
async function mapBallot(sqlExecutor: SqlExecutor, row: DatabaseRow): Promise<Ballot> {
  const target = ballotTargetOf({
    councilDecisionId: identifierSchema.nullable().parse(row.council_decision_id),
    agendaItemId: identifierSchema.nullable().parse(row.agenda_item_id),
  });
  const storedTarget = storedBallotTarget(target);
  const common = {
    id: identifierSchema.parse(row.id),
    meetingId: identifierSchema.parse(row.meeting_id),
    target,
    ...storedTarget,
    result: ballotResultSchema.parse(row.result),
    votesFor: asInteger(row.votes_for, "ballot.votes_for"),
    votesAgainst: asInteger(row.votes_against, "ballot.votes_against"),
    abstentions: asInteger(row.abstentions, "ballot.abstentions"),
    notVoting: asInteger(row.not_voting, "ballot.not_voting"),
    votesCast: asInteger(row.votes_for, "ballot.votes_for") + asInteger(row.votes_against, "ballot.votes_against"),
    chairTieBreakApplied: asBoolean(row.chair_tie_break_applied, "ballot.chair_tie_break_applied"),
    recusedMemberIds: jsonArray(row.recused_member_ids_json),
    participationEvidence: parseParticipationEvidence(row.participation_evidence_json),
    createdAt: asString(row.created_at, "ballot.created_at"),
    cancelledAt: asNullableString(row.cancelled_at, "ballot.cancelled_at"),
  };
  return matchLiteral(ballotMethodSchema.parse(row.method), {
    secret: () => ({ ...common, method: "secret" as const }),
    public: async () => {
      const votes = (await sqlExecutor.all("ballot.votes", { ballotId: common.id })).map(
        (vote): Vote => ({
          id: identifierSchema.parse(vote.id),
          ballotId: identifierSchema.parse(vote.ballot_id),
          memberId: identifierSchema.parse(vote.member_id),
          castByMemberId: identifierSchema.parse(vote.cast_by_member_id),
          choice: voteChoiceSchema.parse(vote.choice),
        }),
      );
      return { ...common, method: "public" as const, votes };
    },
  });
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
      return found
        ? {
            ballot: found.ballot,
            commandFingerprint: asString(found.row.command_fingerprint, "ballot.command_fingerprint"),
          }
        : null;
    },
    recordFinal(input) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        const createdAt = new Date().toISOString();
        const storedTarget = storedBallotTarget(input.target);
        const insert = await sqlExecutor.run("ballot.insert", {
          id,
          meetingId: input.meetingId,
          ...storedTarget,
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
            return asString(replay.row.command_fingerprint, "ballot.command_fingerprint") === input.commandFingerprint
              ? { status: "replayed" as const, ballot: replay.ballot }
              : { status: "idempotencyConflict" as const };
          const claimed = await matchLiteral(input.target.kind, {
            councilDecision: () =>
              sqlExecutor.get("ballot.targetClaimedByDecision", { councilDecisionId: input.target.id }),
            agendaItem: () => sqlExecutor.get("ballot.targetClaimedByAgendaItem", { agendaItemId: input.target.id }),
          });
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
