import { createHash } from "node:crypto";
import {
  type Ballot,
  type BallotMachineState,
  countVoteChoices,
  decideBallot,
  evaluateBallot,
  transitionBallot,
  transitionCouncilDecision,
  type VoteInput,
} from "@mairie/domain";
import type {
  AgendaRepository,
  AttendanceRepository,
  BallotRepository,
  CouncilDecisionRepository,
  CouncilMeetingRepository,
  MeetingRosterRepository,
  UnitOfWork,
} from "../repositories/contracts.js";
import { DomainError } from "./errors.js";
import { participationForMeeting } from "./meetingContext.js";

interface BallotTarget {
  councilDecisionId?: string | null;
  agendaItemId?: string | null;
}

type BallotCommand = BallotTarget & { recusedMemberIds?: string[] } & (
    | { method: "public"; idempotencyKey: string; votes: VoteInput[] }
    | {
        method: "secret";
        idempotencyKey: string;
        totals: { votesFor: number; votesAgainst: number; abstentions: number; notVoting: number };
      }
  );

export interface BallotService {
  recordBallot(meetingId: string, command: BallotCommand): Promise<Ballot>;
  cancelBallot(meetingId: string, ballotId: string): Promise<void>;
}

function commandFingerprint(meetingId: string, command: BallotCommand): string {
  const commandBody =
    command.method === "public"
      ? {
          meetingId,
          method: command.method,
          councilDecisionId: command.councilDecisionId ?? null,
          agendaItemId: command.agendaItemId ?? null,
          recusedMemberIds: [...(command.recusedMemberIds ?? [])].sort(),
          votes: [...command.votes].sort((left, right) =>
            `${left.memberId}:${left.castByMemberId}:${left.choice}`.localeCompare(
              `${right.memberId}:${right.castByMemberId}:${right.choice}`,
            ),
          ),
        }
      : {
          meetingId,
          method: command.method,
          councilDecisionId: command.councilDecisionId ?? null,
          agendaItemId: command.agendaItemId ?? null,
          recusedMemberIds: [...(command.recusedMemberIds ?? [])].sort(),
          totals: {
            votesFor: command.totals.votesFor,
            votesAgainst: command.totals.votesAgainst,
            abstentions: command.totals.abstentions,
            notVoting: command.totals.notVoting,
          },
        };
  return createHash("sha256").update(JSON.stringify(commandBody)).digest("hex");
}

function throwBallotValidationError(state: BallotMachineState): never {
  switch (state) {
    case "meetingNotInProgress":
      throw new DomainError("invalid_meeting_transition", 409);
    case "attendanceIncomplete":
      throw new DomainError("attendance_incomplete", 409);
    case "quorumEvidenceInvalid":
      throw new DomainError("conflict", 409);
    case "quorumNotReached":
      throw new DomainError("quorum_not_reached", 409);
    case "officersMissing":
      throw new DomainError("meeting_officers_required", 409);
    case "proxyInvalid":
      throw new DomainError("proxy_invalid", 409);
    case "recusalsInvalid":
      throw new DomainError("ballot_voters_invalid", 409);
    case "votesInvalid":
      throw new DomainError("conflict");
    default:
      throw new DomainError("conflict", 409);
  }
}

export function createBallotService({
  councilMeetingRepository,
  meetingRosterRepository,
  attendanceRepository,
  agendaRepository,
  councilDecisionRepository,
  ballotRepository,
  unitOfWork,
}: {
  councilMeetingRepository: CouncilMeetingRepository;
  meetingRosterRepository: MeetingRosterRepository;
  attendanceRepository: AttendanceRepository;
  agendaRepository: AgendaRepository;
  councilDecisionRepository: CouncilDecisionRepository;
  ballotRepository: BallotRepository;
  unitOfWork: UnitOfWork;
}): BallotService {
  return {
    async cancelBallot(meetingId, ballotId) {
      return unitOfWork.execute(async () => {
        const meeting = await councilMeetingRepository.find(meetingId);
        if (!meeting) throw new DomainError("meeting_not_found", 404);
        if (transitionBallot("recorded", { type: "CANCEL", meetingStatus: meeting.status }) !== "cancelled") {
          throw new DomainError("invalid_meeting_transition", 409);
        }
        const ballot = await ballotRepository.findById(ballotId);
        if (!ballot || ballot.meetingId !== meetingId || ballot.cancelledAt) {
          throw new DomainError("ballot_not_found", 404);
        }
        const agenda = await agendaRepository.listForMeeting(meetingId);
        const agendaItem = agenda.find((item) =>
          ballot.agendaItemId
            ? item.id === ballot.agendaItemId
            : item.topic.kind === "subject" && item.topic.councilDecisionId === ballot.councilDecisionId,
        );
        if (agendaItem?.completedAt) throw new DomainError("agenda_sequence_invalid", 409);
        await ballotRepository.cancel(ballotId, new Date().toISOString());
        if (ballot.councilDecisionId) {
          const councilDecision = await councilDecisionRepository.find(ballot.councilDecisionId);
          const next = councilDecision
            ? transitionCouncilDecision(councilDecision.status, { type: "REOPEN_BALLOT" })
            : null;
          if (!councilDecision || next !== "scheduled") throw new DomainError("agenda_inconsistent", 409);
          await councilDecisionRepository.setStatus(ballot.councilDecisionId, next);
        }
      });
    },
    async recordBallot(meetingId, command) {
      const fingerprint = commandFingerprint(meetingId, command);
      const previousAttempt = await ballotRepository.findByIdempotencyKey(command.idempotencyKey);
      if (previousAttempt) {
        if (previousAttempt.commandFingerprint !== fingerprint) throw new DomainError("conflict", 409);
        return previousAttempt.ballot;
      }

      return unitOfWork.execute(async () => {
        const repeatedAttempt = await ballotRepository.findByIdempotencyKey(command.idempotencyKey);
        if (repeatedAttempt) {
          if (repeatedAttempt.commandFingerprint !== fingerprint) throw new DomainError("conflict", 409);
          return repeatedAttempt.ballot;
        }

        const meeting = await councilMeetingRepository.find(meetingId);
        if (!meeting) throw new DomainError("meeting_not_found", 404);
        if (Boolean(command.councilDecisionId) === Boolean(command.agendaItemId)) {
          throw new DomainError("invalid_request");
        }
        if (command.councilDecisionId) {
          const councilDecision = await councilDecisionRepository.find(command.councilDecisionId);
          if (!councilDecision) throw new DomainError("council_decision_not_found", 404);
          const existingBallot = await ballotRepository.findFinalForDecision(command.councilDecisionId);
          if (existingBallot || councilDecision.status === "adopted" || councilDecision.status === "rejected") {
            throw new DomainError("ballot_already_recorded", 409);
          }
          const agendaItem = (await agendaRepository.listForMeeting(meetingId)).find(
            (item) => item.topic.kind === "subject" && item.topic.councilDecisionId === command.councilDecisionId,
          );
          if (!agendaItem) throw new DomainError("agenda_inconsistent");
          if (!agendaItem.startedAt || agendaItem.completedAt || agendaItem.topic.state !== "inProgress") {
            throw new DomainError("agenda_sequence_invalid", 409);
          }
        } else {
          const agendaItem = await agendaRepository.find(meetingId, command.agendaItemId!);
          if (!agendaItem) throw new DomainError("agenda_item_not_found", 404);
          if (agendaItem.topic.kind === "subject" && agendaItem.topic.councilDecisionId) {
            throw new DomainError("agenda_inconsistent");
          }
          if (!agendaItem.startedAt || agendaItem.completedAt || agendaItem.topic.state !== "inProgress") {
            throw new DomainError("agenda_sequence_invalid", 409);
          }
          if (await ballotRepository.findForAgendaItem(agendaItem.id)) {
            throw new DomainError("ballot_already_recorded", 409);
          }
        }

        const participationEvidence = await participationForMeeting(
          meeting,
          meetingRosterRepository,
          attendanceRepository,
        );
        const ballotSubmission =
          command.method === "public"
            ? {
                type: "SUBMIT" as const,
                meetingStatus: meeting.status,
                isReconvenedMeeting: meeting.isReconvenedMeeting,
                chairMemberId: meeting.chairMemberId,
                secretaryMemberId: meeting.secretaryMemberId,
                participationEvidence,
                recusedMemberIds: command.recusedMemberIds ?? [],
                method: command.method,
                votes: command.votes,
              }
            : {
                type: "SUBMIT" as const,
                meetingStatus: meeting.status,
                isReconvenedMeeting: meeting.isReconvenedMeeting,
                chairMemberId: meeting.chairMemberId,
                secretaryMemberId: meeting.secretaryMemberId,
                participationEvidence,
                recusedMemberIds: command.recusedMemberIds ?? [],
                method: command.method,
                totals: command.totals,
              };
        const validationState = evaluateBallot(ballotSubmission);
        if (validationState !== "recordable") throwBallotValidationError(validationState);

        let votes: VoteInput[] = [];
        let votesFor: number;
        let votesAgainst: number;
        let abstentions: number;
        let notVoting: number;

        if (command.method === "public") {
          votes = command.votes;
          const counts = countVoteChoices(votes);
          votesFor = counts.for;
          votesAgainst = counts.against;
          abstentions = counts.abstain;
          notVoting = counts.notVoting;
        } else {
          ({ votesFor, votesAgainst, abstentions, notVoting } = command.totals);
        }

        const chairVote =
          command.method === "public" && meeting.chairMemberId
            ? votes.find(
                (vote) => vote.memberId === meeting.chairMemberId && vote.castByMemberId === meeting.chairMemberId,
              )?.choice
            : undefined;
        const decision = decideBallot({ method: command.method, votesFor, votesAgainst, chairVote });
        if (transitionBallot("recordable", { type: "RECORD" }) !== "recorded") {
          throw new DomainError("conflict", 409);
        }
        const recordResult = await ballotRepository.recordFinal({
          meetingId,
          councilDecisionId: command.councilDecisionId ?? null,
          agendaItemId: command.agendaItemId ?? null,
          idempotencyKey: command.idempotencyKey,
          commandFingerprint: fingerprint,
          method: command.method,
          result: decision.result,
          votesFor,
          votesAgainst,
          abstentions,
          notVoting,
          chairTieBreakApplied: decision.chairTieBreakApplied,
          recusedMemberIds: command.recusedMemberIds ?? [],
          votes,
          participationEvidence,
        });
        if (recordResult.status === "idempotencyConflict") throw new DomainError("conflict", 409);
        if (recordResult.status === "decisionAlreadyFinalized") {
          throw new DomainError("ballot_already_recorded", 409);
        }
        if (recordResult.status === "replayed") return recordResult.ballot;
        if (command.councilDecisionId) {
          const councilDecision = await councilDecisionRepository.find(command.councilDecisionId);
          const next = councilDecision
            ? transitionCouncilDecision(councilDecision.status, {
                type: decision.result === "adopted" ? "RECORD_ADOPTION" : "RECORD_REJECTION",
              })
            : null;
          if (!councilDecision || next !== decision.result) throw new DomainError("agenda_inconsistent", 409);
          await councilDecisionRepository.setStatus(command.councilDecisionId, next);
        }
        return recordResult.ballot;
      });
    },
  };
}
