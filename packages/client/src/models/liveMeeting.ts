import type { AgendaItem, BallotVote, MeetingAttendance } from "@hall/api-contract";
import type { CouncilBusinessView } from "./councilBusiness";
import type { CouncilMeetingView, CouncilMeetingWorkspace } from "./councilMeeting";
import type { CouncilMemberView } from "./directory";

export type LiveMeetingStatus = "draft" | "scheduled" | "inProgress" | "closed" | "cancelled";
export type LiveBallotMethod = "public" | "secret";
export type LiveVoteChoice = "for" | "against" | "abstain" | "notVoting";
export type LiveAgendaItemStatus = "scheduled" | "inProgress" | "examined" | "adjourned";

export interface LiveMeetingMemberAttendance {
  id: string;
  meetingId: string;
  memberId: string;
  status: MeetingAttendance["status"];
  proxyHolderMemberId: string | null;
  proxyDocumentId: string | null;
  version: number;
}

export interface LiveMeetingBusiness {
  id: string;
  kind: "matter" | "minutesApproval" | "openQuestion";
  title: string;
  report: string;
  folderPath: string;
  resources: Array<CouncilBusinessView["resources"][number] & { title: string }>;
  councilDecisionId: string | null;
  minutesOfMeetingId?: string;
  minutesId?: string;
  minutesDocumentId?: string | null;
}

export interface LiveMeetingAgendaItem {
  id: string;
  meetingId: string;
  position: number;
  business: LiveMeetingBusiness;
  status: LiveAgendaItemStatus;
  discussionSummary: string;
  startedAt: string | null;
  completedAt: string | null;
  councilDecisionSnapshot: { draftText: string } | null;
}

export interface LiveMeetingBallot {
  id: string;
  meetingId: string;
  councilDecisionId: string | null;
  agendaItemId: string;
  method: LiveBallotMethod;
  result: "adopted" | "rejected" | null;
  votesFor: number;
  votesAgainst: number;
  abstentions: number;
  notVoting: number;
  votesCast: number;
  votes: Array<{ id: string; ballotId: string; memberId: string; castByMemberId: string; choice: LiveVoteChoice }>;
  chairTieBreakApplied: boolean;
  recusedMemberIds: string[];
  participationEvidence: {
    rosterMemberIds: string[];
    attendance: LiveMeetingMemberAttendance[];
    quorum: LiveMeetingPresentation["quorum"];
  };
  createdAt: string;
  cancelledAt: null;
}

export interface LiveMeetingCouncilDecision {
  id: string;
  title: string;
  draftText: string;
  status: "draft";
}

export interface LiveMeetingSummary extends CouncilMeetingView {
  slug: string;
  startsAt: string;
  status: LiveMeetingStatus;
  openedAt: string | null;
  chairMemberId: string | null;
  secretaryMemberId: string | null;
  isReconvenedMeeting: boolean;
  quorumFailure: {
    recordedAt: string;
    quorum: LiveMeetingPresentation["quorum"];
  } | null;
}

export interface LiveMeetingPresentation {
  meeting: LiveMeetingSummary;
  agendaReady: boolean;
  requiredMinutesOfMeetingId: string | null;
  activeMemberCount: number;
  rosterMemberIds: string[];
  attendance: LiveMeetingMemberAttendance[];
  agendaItems: LiveMeetingAgendaItem[];
  councilDecisions: LiveMeetingCouncilDecision[];
  ballots: LiveMeetingBallot[];
  quorum: { activeMembers: number; physicallyPresent: number; required: number; reached: boolean };
}

function businessKind(subject: AgendaItem["subject"]): LiveMeetingBusiness["kind"] {
  if (subject.kind === "councilDecisionProposal") return "matter";
  return subject.kind;
}

function liveChoice(choice: BallotVote["choice"]): LiveVoteChoice {
  if (choice === "approve") return "for";
  if (choice === "reject") return "against";
  return "abstain";
}

export function presentLiveMeeting(
  workspace: CouncilMeetingWorkspace,
  members: readonly CouncilMemberView[],
  businesses: readonly CouncilBusinessView[],
  ballotVotes: ReadonlyMap<string, readonly BallotVote[]> = new Map(),
  ballotParticipantMembers: ReadonlyMap<string, ReadonlyMap<string, string>> = new Map(),
): LiveMeetingPresentation {
  const attendance = workspace.attendance.map(
    (entry): LiveMeetingMemberAttendance => ({
      id: entry.id,
      meetingId: entry.councilMeetingId,
      memberId: entry.councilMemberId,
      status: entry.status,
      proxyHolderMemberId: entry.proxyHolderCouncilMemberId,
      proxyDocumentId: entry.proxyDocumentId,
      version: 1,
    }),
  );
  const quorum = {
    activeMembers: members.length,
    physicallyPresent: attendance.filter((entry) => entry.status === "present").length,
    required: workspace.meeting.quorum,
    reached: attendance.filter((entry) => entry.status === "present").length >= workspace.meeting.quorum,
  };
  const agendaItems = workspace.agendaItems
    .filter((item) => item.position > 0 || item.adjournedAt || item.startedAt)
    .map((item): LiveMeetingAgendaItem => {
      const business = businesses.find((candidate) => candidate.id === item.councilBusinessId);
      return {
        id: item.id,
        meetingId: item.councilMeetingId,
        position: Math.abs(item.position),
        business: {
          id: item.councilBusinessId ?? item.subject.id,
          kind: businessKind(item.subject),
          title: business?.title ?? item.subject.kind,
          report: business?.report ?? "",
          folderPath: business?.folderPath ?? "",
          resources: business?.resources.map((resource) => ({ ...resource, title: resource.name })) ?? [],
          councilDecisionId: item.subject.kind === "councilDecisionProposal" ? item.subject.id : null,
          ...(item.subject.kind === "minutesApproval"
            ? {
                minutesOfMeetingId: workspace.meeting.previousCouncilMeetingId ?? "",
                minutesId: item.subject.minutesId,
                minutesDocumentId: item.subject.documentId,
              }
            : {}),
        },
        status: item.adjournedAt
          ? "adjourned"
          : item.completedAt
            ? "examined"
            : item.startedAt
              ? "inProgress"
              : "scheduled",
        discussionSummary: item.discussionSummary,
        startedAt: item.startedAt,
        completedAt: item.completedAt,
        councilDecisionSnapshot: null,
      };
    });
  const ballots = workspace.ballots.map((ballot): LiveMeetingBallot => {
    const votes = [...(ballotVotes.get(ballot.id) ?? [])];
    const participantMembers = ballotParticipantMembers.get(ballot.id) ?? new Map();
    const total = (choice: BallotVote["choice"]) =>
      votes.filter((vote) => vote.choice === choice).reduce((sum, vote) => sum + vote.count, 0);
    const publicVotes = votes.flatMap((vote, index) => {
      if (vote.mode !== "public") return [];
      return [
        {
          id: `${ballot.id}-${index}`,
          ballotId: ballot.id,
          memberId: participantMembers.get(vote.ballotParticipationId) ?? vote.ballotParticipationId,
          castByMemberId: participantMembers.get(vote.ballotParticipationId) ?? vote.ballotParticipationId,
          choice: liveChoice(vote.choice),
        },
      ];
    });
    return {
      id: ballot.id,
      meetingId: workspace.meeting.id,
      councilDecisionId: null,
      agendaItemId: ballot.agendaItemId,
      method: ballot.mode,
      result: ballot.result === null ? null : ballot.result === "approve" ? "adopted" : "rejected",
      votesFor: total("approve"),
      votesAgainst: total("reject"),
      abstentions: total("abstain"),
      notVoting: 0,
      votesCast: total("approve") + total("reject"),
      votes: publicVotes,
      chairTieBreakApplied: false,
      recusedMemberIds: [],
      participationEvidence: { rosterMemberIds: members.map((member) => member.id), attendance, quorum },
      createdAt:
        ballot.completedAt ?? workspace.meeting.startedAt ?? workspace.meeting.scheduledAt ?? new Date(0).toISOString(),
      cancelledAt: null,
    };
  });

  return {
    meeting: {
      ...workspace.meeting,
      slug: workspace.meeting.slug ?? workspace.meeting.id,
      startsAt: workspace.meeting.scheduledAt ?? new Date(0).toISOString(),
      status: workspace.meeting.phase,
      openedAt: workspace.meeting.startedAt,
      chairMemberId: workspace.meeting.chairMemberId,
      secretaryMemberId: workspace.meeting.secretaryMemberId,
      isReconvenedMeeting: false,
      quorumFailure: null,
    },
    agendaReady: agendaItems.length > 0,
    requiredMinutesOfMeetingId: workspace.meeting.previousCouncilMeetingId,
    activeMemberCount: members.length,
    rosterMemberIds: members.map((member) => member.id),
    attendance,
    agendaItems,
    councilDecisions: workspace.agendaItems.flatMap((item) =>
      item.subject.kind === "councilDecisionProposal"
        ? [
            {
              id: item.subject.id,
              title: businesses.find((business) => business.id === item.councilBusinessId)?.title ?? "",
              draftText: item.subject.content,
              status: "draft" as const,
            },
          ]
        : [],
    ),
    ballots,
    quorum,
  };
}

export type LiveBallotSubmission = ({ agendaItemId: string } | { councilDecisionId: string }) & {
  idempotencyKey: string;
} & (
    | {
        method: "public";
        votes: Array<{ memberId: string; castByMemberId: string; choice: LiveVoteChoice }>;
      }
    | {
        method: "secret";
        totals: { votesFor: number; votesAgainst: number; abstentions: number; notVoting: number };
      }
  );

const agendaRankByBusinessKind: Record<LiveMeetingBusiness["kind"], number> = {
  minutesApproval: 0,
  matter: 1,
  openQuestion: 2,
};

export function liveAgendaBusinessRank(business: LiveMeetingBusiness): number {
  return agendaRankByBusinessKind[business.kind];
}

export function liveBusinessHasDecision(business: LiveMeetingBusiness): boolean {
  return business.kind === "matter" && business.councilDecisionId !== null;
}

export function liveBusinessIsMatter(business: LiveMeetingBusiness): boolean {
  return business.kind === "matter";
}
