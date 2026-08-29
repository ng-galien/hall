import { describe, expect, it } from "vitest";
import {
  agendaItemMachineDefinition,
  type BallotSubmission,
  ballotMachineDefinition,
  councilDecisionMachineDefinition,
  countVoteChoices,
  decideBallot,
  deriveBallotVoters,
  evaluateBallot,
  meetingMachineDefinition,
  transitionAgendaItem,
  transitionBallot,
  transitionCouncilDecision,
  transitionMeeting,
} from "./index.js";

function validPublicSubmission(): Extract<BallotSubmission, { method: "public" }> {
  return {
    type: "SUBMIT",
    meetingStatus: "inProgress",
    isReconvenedMeeting: false,
    chairMemberId: "mayor",
    secretaryMemberId: "secretary",
    recusedMemberIds: [],
    method: "public",
    votes: [
      { memberId: "mayor", castByMemberId: "mayor", choice: "for" },
      { memberId: "secretary", castByMemberId: "secretary", choice: "against" },
      { memberId: "third", castByMemberId: "third", choice: "abstain" },
    ],
    participationEvidence: {
      rosterMemberIds: ["mayor", "secretary", "third"],
      attendance: [
        {
          memberId: "mayor",
          status: "present",
          proxyHolderMemberId: null,
          proxyDocumentId: null,
          version: 1,
        },
        {
          memberId: "secretary",
          status: "present",
          proxyHolderMemberId: null,
          proxyDocumentId: null,
          version: 1,
        },
        {
          memberId: "third",
          status: "present",
          proxyHolderMemberId: null,
          proxyDocumentId: null,
          version: 1,
        },
      ],
      quorum: { activeMembers: 3, physicallyPresent: 3, required: 2, reached: true },
    },
  };
}

describe("auditable state machines", () => {
  it("keeps every definition serializable", () => {
    expect(() => JSON.stringify(meetingMachineDefinition)).not.toThrow();
    expect(() => JSON.stringify(agendaItemMachineDefinition)).not.toThrow();
    expect(() => JSON.stringify(councilDecisionMachineDefinition)).not.toThrow();
    expect(() => JSON.stringify(ballotMachineDefinition)).not.toThrow();
  });

  it("locks the meeting lifecycle", () => {
    expect(transitionMeeting("draft", { type: "SCHEDULE" })).toBe("scheduled");
    expect(transitionMeeting("scheduled", { type: "OPEN" })).toBe("inProgress");
    expect(transitionMeeting("inProgress", { type: "CLOSE" })).toBe("closed");
    expect(transitionMeeting("draft", { type: "OPEN" })).toBeNull();
    expect(transitionMeeting("closed", { type: "OPEN" })).toBeNull();
  });

  it("returns a postponed agenda item to the provision", () => {
    expect(transitionAgendaItem("scheduled", { type: "START" })).toBe("inProgress");
    expect(transitionAgendaItem("inProgress", { type: "COMPLETE" })).toBe("examined");
    expect(transitionAgendaItem("inProgress", { type: "POSTPONE" })).toBe("postponed");
    expect(transitionAgendaItem("scheduled", { type: "WITHDRAW" })).toBe("withdrawn");
    expect(transitionAgendaItem("examined", { type: "START" })).toBeNull();
  });

  it("locks the council decision lifecycle", () => {
    expect(transitionCouncilDecision("draft", { type: "SCHEDULE" })).toBe("scheduled");
    expect(transitionCouncilDecision("scheduled", { type: "RECORD_ADOPTION" })).toBe("adopted");
    expect(transitionCouncilDecision("adopted", { type: "MAKE_ENFORCEABLE" })).toBe("enforceable");
    expect(transitionCouncilDecision("draft", { type: "RECORD_ADOPTION" })).toBeNull();
  });

  it("rejects a ballot without quorum before it becomes recordable", () => {
    expect(
      evaluateBallot({
        type: "SUBMIT",
        meetingStatus: "inProgress",
        isReconvenedMeeting: false,
        chairMemberId: "mayor",
        secretaryMemberId: "secretary",
        recusedMemberIds: [],
        method: "secret",
        totals: { votesFor: 1, votesAgainst: 0, abstentions: 0, notVoting: 0 },
        participationEvidence: {
          rosterMemberIds: ["mayor", "secretary", "third"],
          attendance: [
            {
              memberId: "mayor",
              status: "present",
              proxyHolderMemberId: null,
              proxyDocumentId: null,
              version: 1,
            },
            {
              memberId: "secretary",
              status: "absent",
              proxyHolderMemberId: null,
              proxyDocumentId: null,
              version: 1,
            },
            {
              memberId: "third",
              status: "absent",
              proxyHolderMemberId: null,
              proxyDocumentId: null,
              version: 1,
            },
          ],
          quorum: { activeMembers: 3, physicallyPresent: 1, required: 2, reached: false },
        },
      }),
    ).toBe("quorumNotReached");
  });

  it("validates public proxies and applies the chair tie-break only to public ballots", () => {
    const participationEvidence = {
      rosterMemberIds: ["mayor", "secretary", "represented"],
      attendance: [
        {
          memberId: "mayor",
          status: "present" as const,
          proxyHolderMemberId: null,
          proxyDocumentId: null,
          version: 1,
        },
        {
          memberId: "secretary",
          status: "present" as const,
          proxyHolderMemberId: null,
          proxyDocumentId: null,
          version: 1,
        },
        {
          memberId: "represented",
          status: "represented" as const,
          proxyHolderMemberId: "secretary",
          proxyDocumentId: "written-proxy",
          version: 1,
        },
      ],
      quorum: { activeMembers: 3, physicallyPresent: 2, required: 2, reached: true },
    };
    expect(
      evaluateBallot({
        type: "SUBMIT",
        meetingStatus: "inProgress",
        isReconvenedMeeting: false,
        chairMemberId: "mayor",
        secretaryMemberId: "secretary",
        recusedMemberIds: [],
        method: "public",
        votes: [
          { memberId: "mayor", castByMemberId: "mayor", choice: "for" },
          { memberId: "secretary", castByMemberId: "secretary", choice: "against" },
          { memberId: "represented", castByMemberId: "secretary", choice: "abstain" },
        ],
        participationEvidence,
      }),
    ).toBe("recordable");
    expect(decideBallot({ method: "public", votesFor: 1, votesAgainst: 1, chairVote: "for" })).toEqual({
      result: "adopted",
      chairTieBreakApplied: true,
    });
    expect(decideBallot({ method: "secret", votesFor: 1, votesAgainst: 1 })).toEqual({
      result: "rejected",
      chairTieBreakApplied: false,
    });
  });

  it("separates a conflict-of-interest recusal from an abstention", () => {
    const participationEvidence = {
      rosterMemberIds: ["mayor", "secretary", "interested"],
      attendance: [
        {
          memberId: "mayor",
          status: "present" as const,
          proxyHolderMemberId: null,
          proxyDocumentId: null,
          version: 1,
        },
        {
          memberId: "secretary",
          status: "present" as const,
          proxyHolderMemberId: null,
          proxyDocumentId: null,
          version: 1,
        },
        {
          memberId: "interested",
          status: "present" as const,
          proxyHolderMemberId: null,
          proxyDocumentId: null,
          version: 1,
        },
      ],
      quorum: { activeMembers: 3, physicallyPresent: 3, required: 2, reached: true },
    };
    expect(
      evaluateBallot({
        type: "SUBMIT",
        meetingStatus: "inProgress",
        isReconvenedMeeting: false,
        chairMemberId: "mayor",
        secretaryMemberId: "secretary",
        recusedMemberIds: ["interested"],
        method: "public",
        votes: [
          { memberId: "mayor", castByMemberId: "mayor", choice: "for" },
          { memberId: "secretary", castByMemberId: "secretary", choice: "abstain" },
        ],
        participationEvidence,
      }),
    ).toBe("recordable");
    expect(
      evaluateBallot({
        type: "SUBMIT",
        meetingStatus: "inProgress",
        isReconvenedMeeting: false,
        chairMemberId: "mayor",
        secretaryMemberId: "secretary",
        recusedMemberIds: ["interested"],
        method: "public",
        votes: [
          { memberId: "mayor", castByMemberId: "mayor", choice: "for" },
          { memberId: "secretary", castByMemberId: "secretary", choice: "abstain" },
          { memberId: "interested", castByMemberId: "interested", choice: "notVoting" },
        ],
        participationEvidence,
      }),
    ).toBe("votesInvalid");
  });

  it("only cancels a recorded ballot while the meeting is still in progress", () => {
    expect(transitionBallot("recordable", { type: "RECORD" })).toBe("recorded");
    expect(transitionBallot("recorded", { type: "CANCEL", meetingStatus: "scheduled" })).toBeNull();
    expect(transitionBallot("recorded", { type: "CANCEL", meetingStatus: "inProgress" })).toBe("cancelled");
  });

  it("classifies every invalid ballot prerequisite before recording", () => {
    const valid = validPublicSubmission();
    expect(evaluateBallot({ ...valid, meetingStatus: "scheduled" })).toBe("meetingNotInProgress");
    expect(
      evaluateBallot({
        ...valid,
        participationEvidence: {
          ...valid.participationEvidence,
          attendance: valid.participationEvidence.attendance.slice(0, 2),
        },
      }),
    ).toBe("attendanceIncomplete");
    expect(
      evaluateBallot({
        ...valid,
        participationEvidence: {
          ...valid.participationEvidence,
          quorum: { ...valid.participationEvidence.quorum, physicallyPresent: 2 },
        },
      }),
    ).toBe("quorumEvidenceInvalid");
    expect(evaluateBallot({ ...valid, chairMemberId: null })).toBe("officersMissing");

    const represented = {
      memberId: "third",
      status: "represented" as const,
      proxyHolderMemberId: "secretary",
      proxyDocumentId: null,
      version: 1,
    };
    expect(
      evaluateBallot({
        ...valid,
        participationEvidence: {
          ...valid.participationEvidence,
          attendance: [...valid.participationEvidence.attendance.slice(0, 2), represented],
          quorum: { activeMembers: 3, physicallyPresent: 2, required: 2, reached: true },
        },
      }),
    ).toBe("proxyInvalid");
    expect(evaluateBallot({ ...valid, recusedMemberIds: ["third", "third"] })).toBe("recusalsInvalid");
    expect(evaluateBallot({ ...valid, recusedMemberIds: ["absent"] })).toBe("recusalsInvalid");
    expect(evaluateBallot({ ...valid, votes: valid.votes.slice(0, 2) })).toBe("votesInvalid");
    expect(
      evaluateBallot({
        ...valid,
        votes: valid.votes.map((vote) => (vote.memberId === "third" ? { ...vote, castByMemberId: "secretary" } : vote)),
      }),
    ).toBe("votesInvalid");
  });

  it("covers aggregate secret ballots, voter derivation and vote totals", () => {
    const valid = validPublicSubmission();
    expect(
      evaluateBallot({
        ...valid,
        method: "secret",
        totals: { votesFor: 1, votesAgainst: 1, abstentions: 1, notVoting: 0 },
      }),
    ).toBe("recordable");
    expect(
      evaluateBallot({
        ...valid,
        method: "secret",
        totals: { votesFor: 1, votesAgainst: 1, abstentions: 0, notVoting: 0 },
      }),
    ).toBe("votesInvalid");
    expect(deriveBallotVoters({ ...valid, recusedMemberIds: ["third"] })).toEqual([
      { kind: "present", memberId: "mayor", castByMemberId: "mayor" },
      { kind: "present", memberId: "secretary", castByMemberId: "secretary" },
    ]);
    expect(
      deriveBallotVoters({
        ...valid,
        participationEvidence: {
          ...valid.participationEvidence,
          attendance: [
            ...valid.participationEvidence.attendance.slice(0, 2),
            { ...valid.participationEvidence.attendance[2], status: "absent" },
          ],
        },
      }),
    ).toHaveLength(2);
    expect(countVoteChoices(valid.votes)).toEqual({ for: 1, against: 1, abstain: 1, notVoting: 0 });
    expect(decideBallot({ method: "public", votesFor: 1, votesAgainst: 1, chairVote: "against" })).toEqual({
      result: "rejected",
      chairTieBreakApplied: true,
    });
    expect(decideBallot({ method: "public", votesFor: 2, votesAgainst: 1, chairVote: "against" })).toEqual({
      result: "adopted",
      chairTieBreakApplied: false,
    });
  });
});
