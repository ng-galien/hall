import { getNextSnapshot, setup } from "xstate";
import type {
  BallotMethod,
  BallotResult,
  MeetingStatus,
  ParticipationEvidence,
  VoteChoice,
  VoteInput,
} from "../model.js";
import { isAttendanceComplete, isQuorumEvidenceConsistent } from "../participationPolicy.js";

export type BallotMachineState =
  | "draft"
  | "recordable"
  | "recorded"
  | "cancelled"
  | "meetingNotInProgress"
  | "attendanceIncomplete"
  | "quorumEvidenceInvalid"
  | "quorumNotReached"
  | "officersMissing"
  | "proxyInvalid"
  | "recusalsInvalid"
  | "votesInvalid";

export type BallotVoter =
  | { kind: "present"; memberId: string; castByMemberId: string }
  | { kind: "represented"; memberId: string; castByMemberId: string; proxyDocumentId: string };

export type BallotSubmission = {
  type: "SUBMIT";
  meetingStatus: MeetingStatus;
  isReconvenedMeeting: boolean;
  chairMemberId: string | null;
  secretaryMemberId: string | null;
  participationEvidence: ParticipationEvidence;
  recusedMemberIds: string[];
} & (
  | { method: "public"; votes: VoteInput[] }
  | {
      method: "secret";
      totals: { votesFor: number; votesAgainst: number; abstentions: number; notVoting: number };
    }
);

export type BallotEvent = BallotSubmission | { type: "RECORD" } | { type: "CANCEL"; meetingStatus: MeetingStatus };

export interface BallotOutcome {
  result: BallotResult;
  votesFor: number;
  votesAgainst: number;
  abstentions: number;
  notVoting: number;
  /** Votes cast include only votes for and votes against. */
  votesCast: number;
  chairTieBreakApplied: boolean;
}

function proxiesAreValid(event: BallotSubmission): boolean {
  const attendanceByMember = new Map(event.participationEvidence.attendance.map((item) => [item.memberId, item]));
  const proxyCountByHolder = new Map<string, number>();
  for (const item of event.participationEvidence.attendance) {
    if (item.status !== "represented" || !item.proxyHolderMemberId) continue;
    proxyCountByHolder.set(item.proxyHolderMemberId, (proxyCountByHolder.get(item.proxyHolderMemberId) ?? 0) + 1);
  }
  if ([...proxyCountByHolder.values()].some((count) => count > 1)) return false;
  return event.participationEvidence.attendance
    .filter((item) => item.status === "present" || item.status === "represented")
    .every((item) => {
      const attendance = attendanceByMember.get(item.memberId)!;
      if (attendance.status !== "represented") return true;
      const holder = attendance.proxyHolderMemberId
        ? attendanceByMember.get(attendance.proxyHolderMemberId)
        : undefined;
      return Boolean(attendance.proxyDocumentId && holder?.status === "present");
    });
}

export function deriveBallotVoters(event: BallotSubmission): BallotVoter[] {
  const recused = new Set(event.recusedMemberIds);
  return event.participationEvidence.attendance.flatMap((attendance): BallotVoter[] => {
    if (recused.has(attendance.memberId)) return [];
    if (attendance.status === "present") {
      return [{ kind: "present", memberId: attendance.memberId, castByMemberId: attendance.memberId }];
    }
    if (attendance.status === "represented" && attendance.proxyHolderMemberId && attendance.proxyDocumentId) {
      return [
        {
          kind: "represented",
          memberId: attendance.memberId,
          castByMemberId: attendance.proxyHolderMemberId,
          proxyDocumentId: attendance.proxyDocumentId,
        },
      ];
    }
    return [];
  });
}

function recusalsAreValid(event: BallotSubmission): boolean {
  const recused = new Set(event.recusedMemberIds);
  if (recused.size !== event.recusedMemberIds.length) return false;
  const participatingMemberIds = new Set(
    event.participationEvidence.attendance
      .filter((item) => item.status === "present" || item.status === "represented")
      .map((item) => item.memberId),
  );
  if (event.recusedMemberIds.some((memberId) => !participatingMemberIds.has(memberId))) return false;
  return deriveBallotVoters(event).every((voter) => !recused.has(voter.castByMemberId));
}

function votesAreValid(event: BallotSubmission): boolean {
  const eligibleVoters = deriveBallotVoters(event);
  const eligibleByMember = new Map(eligibleVoters.map((voter) => [voter.memberId, voter]));
  if (event.method === "secret") {
    const { votesFor, votesAgainst, abstentions, notVoting } = event.totals;
    return votesFor + votesAgainst + abstentions + notVoting === eligibleVoters.length;
  }

  const seenMembers = new Set<string>();
  for (const vote of event.votes) {
    const voter = eligibleByMember.get(vote.memberId);
    if (seenMembers.has(vote.memberId) || !voter) return false;
    seenMembers.add(vote.memberId);
    if (vote.castByMemberId !== voter.castByMemberId) return false;
  }
  return seenMembers.size === eligibleVoters.length && eligibleVoters.every((voter) => seenMembers.has(voter.memberId));
}

export const ballotMachineDefinition = {
  id: "ballot",
  initial: "draft",
  context: {},
  states: {
    draft: {
      on: {
        SUBMIT: [
          { guard: "meetingNotInProgress", target: "meetingNotInProgress" },
          { guard: "attendanceIncomplete", target: "attendanceIncomplete" },
          { guard: "quorumEvidenceInvalid", target: "quorumEvidenceInvalid" },
          { guard: "quorumNotReached", target: "quorumNotReached" },
          { guard: "officersMissing", target: "officersMissing" },
          { guard: "proxyInvalid", target: "proxyInvalid" },
          { guard: "recusalsInvalid", target: "recusalsInvalid" },
          { guard: "votesInvalid", target: "votesInvalid" },
          { target: "recordable" },
        ],
      },
    },
    recordable: { on: { RECORD: "recorded" } },
    recorded: { on: { CANCEL: { guard: "cancellationDuringMeeting", target: "cancelled" } } },
    cancelled: { type: "final" },
    meetingNotInProgress: { type: "final" },
    attendanceIncomplete: { type: "final" },
    quorumEvidenceInvalid: { type: "final" },
    quorumNotReached: { type: "final" },
    officersMissing: { type: "final" },
    proxyInvalid: { type: "final" },
    recusalsInvalid: { type: "final" },
    votesInvalid: { type: "final" },
  },
} as const;

export const ballotMachine = setup({
  types: {
    context: {} as Record<string, never>,
    events: {} as BallotEvent,
  },
  guards: {
    meetingNotInProgress: ({ event }) => event.type === "SUBMIT" && event.meetingStatus !== "inProgress",
    attendanceIncomplete: ({ event }) => event.type === "SUBMIT" && !isAttendanceComplete(event.participationEvidence),
    quorumEvidenceInvalid: ({ event }) =>
      event.type === "SUBMIT" && !isQuorumEvidenceConsistent(event.participationEvidence, event.isReconvenedMeeting),
    quorumNotReached: ({ event }) => event.type === "SUBMIT" && !event.participationEvidence.quorum.reached,
    officersMissing: ({ event }) => {
      if (event.type !== "SUBMIT") return false;
      const attendanceByMember = new Map(event.participationEvidence.attendance.map((item) => [item.memberId, item]));
      return (
        !event.chairMemberId ||
        !event.secretaryMemberId ||
        attendanceByMember.get(event.chairMemberId)?.status !== "present" ||
        attendanceByMember.get(event.secretaryMemberId)?.status !== "present"
      );
    },
    proxyInvalid: ({ event }) => event.type === "SUBMIT" && !proxiesAreValid(event),
    recusalsInvalid: ({ event }) => event.type === "SUBMIT" && !recusalsAreValid(event),
    votesInvalid: ({ event }) => event.type === "SUBMIT" && !votesAreValid(event),
    cancellationDuringMeeting: ({ event }) => event.type === "CANCEL" && event.meetingStatus === "inProgress",
  },
}).createMachine(ballotMachineDefinition);

export function transitionBallot(state: BallotMachineState, event: BallotEvent): BallotMachineState | null {
  const current = ballotMachine.resolveState({ value: state, context: {} });
  if (!current.can(event)) return null;
  return getNextSnapshot(ballotMachine, current, event).value as BallotMachineState;
}

export function evaluateBallot(event: BallotSubmission): BallotMachineState {
  return transitionBallot("draft", event) ?? "votesInvalid";
}

export function countVoteChoices(votes: VoteInput[]): Record<VoteChoice, number> {
  const counts: Record<VoteChoice, number> = { for: 0, against: 0, abstain: 0, notVoting: 0 };
  for (const vote of votes) counts[vote.choice] += 1;
  return counts;
}

export function decideBallot({
  method,
  votesFor,
  votesAgainst,
  chairVote,
}: {
  method: BallotMethod;
  votesFor: number;
  votesAgainst: number;
  chairVote?: VoteChoice;
}): Pick<BallotOutcome, "result" | "chairTieBreakApplied"> {
  const tie = votesFor === votesAgainst;
  const chairTieBreakApplied = tie && method === "public" && (chairVote === "for" || chairVote === "against");
  return {
    result: votesFor > votesAgainst || (chairTieBreakApplied && chairVote === "for") ? "adopted" : "rejected",
    chairTieBreakApplied,
  };
}
