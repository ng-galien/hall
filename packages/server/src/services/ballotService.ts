import { createHash } from "node:crypto";
import {
  type Ballot,
  type BallotMachineState,
  ballotTargetOf,
  type CouncilMeeting,
  councilBusinessAgendaProfile,
  councilDecisionContentCanChange,
  countVoteChoices,
  decideBallot,
  evaluateBallot,
  matchDiscriminated,
  matchLiteral,
  type ParticipationEvidence,
  transitionBallot,
  transitionCouncilDecision,
  type VoteInput,
} from "@hall/domain";
import type {
  AgendaItemRepository,
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
  const commandBody = matchDiscriminated(command, "method", {
    public: (entry) => ({
      meetingId,
      method: entry.method,
      councilDecisionId: entry.councilDecisionId ?? null,
      agendaItemId: entry.agendaItemId ?? null,
      recusedMemberIds: [...(entry.recusedMemberIds ?? [])].sort(),
      votes: [...entry.votes].sort((left, right) =>
        `${left.memberId}:${left.castByMemberId}:${left.choice}`.localeCompare(
          `${right.memberId}:${right.castByMemberId}:${right.choice}`,
        ),
      ),
    }),
    secret: (entry) => ({
      meetingId,
      method: entry.method,
      councilDecisionId: entry.councilDecisionId ?? null,
      agendaItemId: entry.agendaItemId ?? null,
      recusedMemberIds: [...(entry.recusedMemberIds ?? [])].sort(),
      totals: {
        votesFor: entry.totals.votesFor,
        votesAgainst: entry.totals.votesAgainst,
        abstentions: entry.totals.abstentions,
        notVoting: entry.totals.notVoting,
      },
    }),
  });
  return createHash("sha256").update(JSON.stringify(commandBody)).digest("hex");
}

function ballotCommandExecution(
  command: BallotCommand,
  meeting: CouncilMeeting,
  participationEvidence: ParticipationEvidence,
) {
  const common = {
    type: "SUBMIT" as const,
    meetingStatus: meeting.status,
    isReconvenedMeeting: meeting.isReconvenedMeeting,
    chairMemberId: meeting.chairMemberId,
    secretaryMemberId: meeting.secretaryMemberId,
    participationEvidence,
    recusedMemberIds: command.recusedMemberIds ?? [],
  };
  return matchDiscriminated(command, "method", {
    public: (entry) => {
      const counts = countVoteChoices(entry.votes);
      return {
        submission: { ...common, method: entry.method, votes: entry.votes },
        votes: entry.votes,
        votesFor: counts.for,
        votesAgainst: counts.against,
        abstentions: counts.abstain,
        notVoting: counts.notVoting,
        chairVote: meeting.chairMemberId
          ? entry.votes.find(
              (vote) => vote.memberId === meeting.chairMemberId && vote.castByMemberId === meeting.chairMemberId,
            )?.choice
          : undefined,
      };
    },
    secret: (entry) => ({
      submission: { ...common, method: entry.method, totals: entry.totals },
      votes: [] as VoteInput[],
      ...entry.totals,
      chairVote: undefined,
    }),
  });
}

function throwBallotValidationError(state: BallotMachineState): never {
  return matchLiteral(state, {
    draft: () => {
      throw new DomainError("conflict", 409);
    },
    recordable: () => {
      throw new DomainError("conflict", 409);
    },
    recorded: () => {
      throw new DomainError("conflict", 409);
    },
    cancelled: () => {
      throw new DomainError("conflict", 409);
    },
    meetingNotInProgress: () => {
      throw new DomainError("invalid_meeting_transition", 409);
    },
    attendanceIncomplete: () => {
      throw new DomainError("attendance_incomplete", 409);
    },
    quorumEvidenceInvalid: () => {
      throw new DomainError("conflict", 409);
    },
    quorumNotReached: () => {
      throw new DomainError("quorum_not_reached", 409);
    },
    officersMissing: () => {
      throw new DomainError("meeting_officers_required", 409);
    },
    proxyInvalid: () => {
      throw new DomainError("proxy_invalid", 409);
    },
    recusalsInvalid: () => {
      throw new DomainError("ballot_voters_invalid", 409);
    },
    votesInvalid: () => {
      throw new DomainError("conflict");
    },
  });
}

export function createBallotService({
  councilMeetingRepository,
  meetingRosterRepository,
  attendanceRepository,
  agendaItemRepository,
  councilDecisionRepository,
  ballotRepository,
  unitOfWork,
}: {
  councilMeetingRepository: CouncilMeetingRepository;
  meetingRosterRepository: MeetingRosterRepository;
  attendanceRepository: AttendanceRepository;
  agendaItemRepository: AgendaItemRepository;
  councilDecisionRepository: CouncilDecisionRepository;
  ballotRepository: BallotRepository;
  unitOfWork: UnitOfWork;
}): BallotService {
  return {
    async cancelBallot(meetingId, ballotId) {
      return unitOfWork.execute(async () => {
        const meeting = await councilMeetingRepository.find(meetingId);
        if (!meeting) throw new DomainError("meeting_not_found", 404);
        const id = meeting.id;
        if (transitionBallot("recorded", { type: "CANCEL", meetingStatus: meeting.status }) !== "cancelled") {
          throw new DomainError("invalid_meeting_transition", 409);
        }
        const ballot = await ballotRepository.findById(ballotId);
        if (!ballot || ballot.meetingId !== id || ballot.cancelledAt) {
          throw new DomainError("ballot_not_found", 404);
        }
        const target = ballot.target;
        const agenda = await agendaItemRepository.listForMeeting(id);
        const agendaItem = agenda.find((item) =>
          matchDiscriminated(target, "kind", {
            agendaItem: (entry) => item.id === entry.id,
            councilDecision: (entry) => councilBusinessAgendaProfile(item.business).councilDecisionId === entry.id,
          }),
        );
        if (agendaItem?.completedAt) throw new DomainError("agenda_sequence_invalid", 409);
        await ballotRepository.cancel(ballotId, new Date().toISOString());
        await matchDiscriminated(target, "kind", {
          agendaItem: async () => undefined,
          councilDecision: async (entry) => {
            const councilDecision = await councilDecisionRepository.find(entry.id);
            const next = councilDecision
              ? transitionCouncilDecision(councilDecision.status, { type: "REOPEN_BALLOT" })
              : null;
            if (!councilDecision || next !== "scheduled") throw new DomainError("agenda_inconsistent", 409);
            await councilDecisionRepository.setStatus(entry.id, next);
          },
        });
      });
    },
    async recordBallot(meetingReference, command) {
      const referencedMeeting = await councilMeetingRepository.find(meetingReference);
      if (!referencedMeeting) throw new DomainError("meeting_not_found", 404);
      const meetingId = referencedMeeting.id;
      const target = ballotTargetOf(command);
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
        await matchDiscriminated(target, "kind", {
          councilDecision: async (entry) => {
            const councilDecision = await councilDecisionRepository.find(entry.id);
            if (!councilDecision) throw new DomainError("council_decision_not_found", 404);
            const existingBallot = await ballotRepository.findFinalForDecision(entry.id);
            if (existingBallot || !councilDecisionContentCanChange(councilDecision.status)) {
              throw new DomainError("ballot_already_recorded", 409);
            }
            const agendaItem = (await agendaItemRepository.listForMeeting(meetingId)).find(
              (item) => councilBusinessAgendaProfile(item.business).councilDecisionId === entry.id,
            );
            if (!agendaItem) throw new DomainError("agenda_inconsistent");
            if (agendaItem.addedDuringSession) throw new DomainError("agenda_sequence_invalid", 409);
            if (agendaItem.status !== "inProgress" || !agendaItem.startedAt || agendaItem.completedAt) {
              throw new DomainError("agenda_sequence_invalid", 409);
            }
          },
          agendaItem: async (entry) => {
            const agendaItem = await agendaItemRepository.find(meetingId, entry.id);
            if (!agendaItem) throw new DomainError("agenda_item_not_found", 404);
            if (agendaItem.addedDuringSession) throw new DomainError("agenda_sequence_invalid", 409);
            const businessProfile = councilBusinessAgendaProfile(agendaItem.business);
            if (businessProfile.ballotTarget === null) throw new DomainError("agenda_sequence_invalid", 409);
            if (businessProfile.ballotTarget === "decision") throw new DomainError("agenda_inconsistent");
            if (agendaItem.status !== "inProgress" || !agendaItem.startedAt || agendaItem.completedAt) {
              throw new DomainError("agenda_sequence_invalid", 409);
            }
            if (await ballotRepository.findForAgendaItem(agendaItem.id)) {
              throw new DomainError("ballot_already_recorded", 409);
            }
          },
        });

        const participationEvidence = await participationForMeeting(
          meeting,
          meetingRosterRepository,
          attendanceRepository,
        );
        const execution = ballotCommandExecution(command, meeting, participationEvidence);
        const validationState = evaluateBallot(execution.submission);
        if (validationState !== "recordable") throwBallotValidationError(validationState);
        const decision = decideBallot({
          method: command.method,
          votesFor: execution.votesFor,
          votesAgainst: execution.votesAgainst,
          chairVote: execution.chairVote,
        });
        if (transitionBallot("recordable", { type: "RECORD" }) !== "recorded") {
          throw new DomainError("conflict", 409);
        }
        const recordResult = await ballotRepository.recordFinal({
          meetingId,
          target,
          idempotencyKey: command.idempotencyKey,
          commandFingerprint: fingerprint,
          method: command.method,
          result: decision.result,
          votesFor: execution.votesFor,
          votesAgainst: execution.votesAgainst,
          abstentions: execution.abstentions,
          notVoting: execution.notVoting,
          chairTieBreakApplied: decision.chairTieBreakApplied,
          recusedMemberIds: command.recusedMemberIds ?? [],
          votes: execution.votes,
          participationEvidence,
        });
        if (recordResult.status === "idempotencyConflict") throw new DomainError("conflict", 409);
        if (recordResult.status === "decisionAlreadyFinalized") {
          throw new DomainError("ballot_already_recorded", 409);
        }
        if (recordResult.status === "replayed") return recordResult.ballot;
        await matchDiscriminated(target, "kind", {
          agendaItem: async () => undefined,
          councilDecision: async (entry) => {
            const councilDecision = await councilDecisionRepository.find(entry.id);
            const next = councilDecision
              ? transitionCouncilDecision(councilDecision.status, {
                  type: decision.result === "adopted" ? "RECORD_ADOPTION" : "RECORD_REJECTION",
                })
              : null;
            if (!councilDecision || next !== decision.result) throw new DomainError("agenda_inconsistent", 409);
            await councilDecisionRepository.setStatus(entry.id, next);
          },
        });
        return recordResult.ballot;
      });
    },
  };
}
