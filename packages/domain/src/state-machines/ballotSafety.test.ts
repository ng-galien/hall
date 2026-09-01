import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { getShortestPaths } from "xstate/graph";
import type { AttendanceEvidence, BallotMethod, ParticipationEvidence, VoteChoice } from "../model.js";
import { calculateQuorum, isAttendanceComplete, isQuorumEvidenceConsistent } from "../participationPolicy.js";
import {
  type BallotSubmission,
  ballotMachine,
  countVoteChoices,
  decideBallot,
  deriveBallotVoters,
  evaluateBallot,
} from "./ballotMachine.js";

const choices = ["for", "against", "abstain", "notVoting"] as const satisfies readonly VoteChoice[];

function memberId(index: number): string {
  return `member-${index}`;
}

function attendance(memberIds: string[]): AttendanceEvidence[] {
  return memberIds.map((id) => ({
    memberId: id,
    status: "present",
    proxyHolderMemberId: null,
    proxyDocumentId: null,
    version: 1,
  }));
}

function participation(memberIds: string[], entries = attendance(memberIds)): ParticipationEvidence {
  return {
    rosterMemberIds: memberIds,
    attendance: entries,
    quorum: calculateQuorum(memberIds.length, entries, false),
  };
}

function publicSubmission(voteChoices: VoteChoice[]): BallotSubmission {
  const memberIds = voteChoices.map((_, index) => memberId(index));
  return {
    type: "SUBMIT",
    meetingStatus: "inProgress",
    isReconvenedMeeting: false,
    chairMemberId: memberIds[0] ?? null,
    secretaryMemberId: memberIds[1] ?? memberIds[0] ?? null,
    recusedMemberIds: [],
    method: "public",
    votes: voteChoices.map((choice, index) => ({
      memberId: memberIds[index],
      castByMemberId: memberIds[index],
      choice,
    })),
    participationEvidence: participation(memberIds),
  };
}

/** Independent mathematical oracle: it does not call the production ballot helpers. */
function oracleDecision(method: BallotMethod, votesFor: number, votesAgainst: number, chairVote?: VoteChoice) {
  if (votesFor > votesAgainst) return { result: "adopted", chairTieBreakApplied: false } as const;
  if (votesFor < votesAgainst) return { result: "rejected", chairTieBreakApplied: false } as const;
  if (method === "public" && chairVote === "for") return { result: "adopted", chairTieBreakApplied: true } as const;
  if (method === "public" && chairVote === "against") {
    return { result: "rejected", chairTieBreakApplied: true } as const;
  }
  return { result: "rejected", chairTieBreakApplied: false } as const;
}

function choicesFromOrdinal(size: number, ordinal: number): VoteChoice[] {
  const result: VoteChoice[] = [];
  let remaining = ordinal;
  for (let index = 0; index < size; index += 1) {
    result.push(choices[remaining % choices.length]);
    remaining = Math.floor(remaining / choices.length);
  }
  return result;
}

describe("ballot safety invariants", () => {
  it("exhaustively agrees with the independent result oracle for councils up to seven voters", () => {
    for (let voterCount = 2; voterCount <= 7; voterCount += 1) {
      const combinations = choices.length ** voterCount;
      for (let ordinal = 0; ordinal < combinations; ordinal += 1) {
        const submission = publicSubmission(choicesFromOrdinal(voterCount, ordinal));
        expect(evaluateBallot(submission)).toBe("recordable");
        if (submission.method !== "public") throw new Error("Expected a public ballot");
        const counts = countVoteChoices(submission.votes);
        const chairVote = submission.votes[0]?.choice;
        expect(
          decideBallot({
            method: "public",
            votesFor: counts.for,
            votesAgainst: counts.against,
            chairVote,
          }),
        ).toEqual(oracleDecision("public", counts.for, counts.against, chairVote));
        expect(counts.for + counts.against + counts.abstain + counts.notVoting).toBe(voterCount);
      }
    }
  });

  it("exhaustively calculates ordinary and reconvened quorum boundaries", () => {
    expect(calculateQuorum(0, [], false)).toEqual({
      activeMembers: 0,
      physicallyPresent: 0,
      required: 1,
      reached: false,
    });
    expect(calculateQuorum(0, [{ status: "present" }], false).reached).toBe(false);
    for (let activeMembers = 1; activeMembers <= 80; activeMembers += 1) {
      for (let physicallyPresent = 0; physicallyPresent <= activeMembers; physicallyPresent += 1) {
        const entries = Array.from({ length: activeMembers }, (_, index) => ({
          status: index < physicallyPresent ? ("present" as const) : ("absent" as const),
        }));
        const ordinary = calculateQuorum(activeMembers, entries, false);
        expect(ordinary).toEqual({
          activeMembers,
          physicallyPresent,
          required: Math.floor(activeMembers / 2) + 1,
          reached: physicallyPresent >= Math.floor(activeMembers / 2) + 1,
        });
        expect(calculateQuorum(activeMembers, entries, true).reached).toBe(true);
      }
    }
  });

  it("preserves vote conservation and result semantics for generated public ballots", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...choices), { minLength: 2, maxLength: 80 }), (generatedChoices) => {
        const submission = publicSubmission(generatedChoices);
        expect(evaluateBallot(submission)).toBe("recordable");
        if (submission.method !== "public") throw new Error("Expected a public ballot");
        const counts = countVoteChoices(submission.votes);
        const voters = deriveBallotVoters(submission);
        expect(counts.for + counts.against + counts.abstain + counts.notVoting).toBe(voters.length);
        expect(counts.for + counts.against).toBe(
          submission.votes.filter((vote) => vote.choice === "for" || vote.choice === "against").length,
        );
        expect(
          decideBallot({
            method: "public",
            votesFor: counts.for,
            votesAgainst: counts.against,
            chairVote: submission.votes[0]?.choice,
          }),
        ).toEqual(oracleDecision("public", counts.for, counts.against, submission.votes[0]?.choice));
      }),
      { numRuns: 2_000 },
    );
  });

  it("is invariant under vote ordering and bijective member renaming", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...choices), { minLength: 2, maxLength: 60 }), (generatedChoices) => {
        const original = publicSubmission(generatedChoices);
        if (original.method !== "public") throw new Error("Expected a public ballot");
        const reversed = { ...original, votes: [...original.votes].reverse() };
        expect(evaluateBallot(reversed)).toBe(evaluateBallot(original));
        expect(countVoteChoices(reversed.votes)).toEqual(countVoteChoices(original.votes));

        const renamed = {
          ...original,
          chairMemberId: `renamed-${original.chairMemberId}`,
          secretaryMemberId: `renamed-${original.secretaryMemberId}`,
          votes: original.votes.map((vote) => ({
            ...vote,
            memberId: `renamed-${vote.memberId}`,
            castByMemberId: `renamed-${vote.castByMemberId}`,
          })),
          participationEvidence: {
            ...original.participationEvidence,
            rosterMemberIds: original.participationEvidence.rosterMemberIds.map((id) => `renamed-${id}`),
            attendance: original.participationEvidence.attendance.map((entry) => ({
              ...entry,
              memberId: `renamed-${entry.memberId}`,
            })),
          },
        };
        expect(evaluateBallot(renamed)).toBe(evaluateBallot(original));
      }),
      { numRuns: 1_000 },
    );
  });

  it("preserves vote conservation and forbids a chair tie-break for generated secret ballots", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 80 }),
        fc.integer({ min: 0, max: 80 }),
        fc.integer({ min: 0, max: 80 }),
        fc.integer({ min: 0, max: 80 }),
        (voterCount, votesForSeed, votesAgainstSeed, abstentionsSeed) => {
          const votesFor = votesForSeed % (voterCount + 1);
          const votesAgainst = votesAgainstSeed % (voterCount - votesFor + 1);
          const abstentions = abstentionsSeed % (voterCount - votesFor - votesAgainst + 1);
          const notVoting = voterCount - votesFor - votesAgainst - abstentions;
          const memberIds = Array.from({ length: voterCount }, (_, index) => memberId(index));
          const submission: BallotSubmission = {
            type: "SUBMIT",
            meetingStatus: "inProgress",
            isReconvenedMeeting: false,
            chairMemberId: memberIds[0],
            secretaryMemberId: memberIds[1],
            recusedMemberIds: [],
            method: "secret",
            totals: { votesFor, votesAgainst, abstentions, notVoting },
            participationEvidence: participation(memberIds),
          };

          expect(evaluateBallot(submission)).toBe("recordable");
          expect(votesFor + votesAgainst + abstentions + notVoting).toBe(voterCount);
          expect(decideBallot({ method: "secret", votesFor, votesAgainst, chairVote: "for" })).toEqual(
            oracleDecision("secret", votesFor, votesAgainst, "for"),
          );
          expect(
            decideBallot({ method: "secret", votesFor, votesAgainst, chairVote: "for" }).chairTieBreakApplied,
          ).toBe(false);
        },
      ),
      { numRuns: 2_000 },
    );
  });

  it("rejects malformed secret totals even when their arithmetic sum matches the electorate", () => {
    const memberIds = [memberId(0), memberId(1)];
    const valid: BallotSubmission = {
      type: "SUBMIT",
      meetingStatus: "inProgress",
      isReconvenedMeeting: false,
      chairMemberId: memberIds[0],
      secretaryMemberId: memberIds[1],
      recusedMemberIds: [],
      method: "secret",
      totals: { votesFor: 1, votesAgainst: 1, abstentions: 0, notVoting: 0 },
      participationEvidence: participation(memberIds),
    };

    for (const totals of [
      { votesFor: -1, votesAgainst: 3, abstentions: 0, notVoting: 0 },
      { votesFor: 0.5, votesAgainst: 1.5, abstentions: 0, notVoting: 0 },
      { votesFor: Number.NaN, votesAgainst: Number.NaN, abstentions: 1, notVoting: 1 },
      { votesFor: Number.POSITIVE_INFINITY, votesAgainst: Number.NEGATIVE_INFINITY, abstentions: 1, notVoting: 1 },
    ]) {
      expect(evaluateBallot({ ...valid, totals })).toBe("votesInvalid");
    }
  });

  it("rejects generated missing, duplicate and misattributed public votes", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...choices), { minLength: 2, maxLength: 40 }), (generatedChoices) => {
        const submission = publicSubmission(generatedChoices);
        if (submission.method !== "public") throw new Error("Expected a public ballot");
        expect(evaluateBallot({ ...submission, votes: submission.votes.slice(1) })).toBe("votesInvalid");
        expect(evaluateBallot({ ...submission, votes: [...submission.votes, submission.votes[0]] })).toBe(
          "votesInvalid",
        );
        expect(
          evaluateBallot({
            ...submission,
            votes: submission.votes.map((vote, index) =>
              index === 0 ? { ...vote, castByMemberId: submission.votes[1].memberId } : vote,
            ),
          }),
        ).toBe("votesInvalid");
      }),
      { numRuns: 1_000 },
    );
  });

  it("accepts one valid proxy and excludes represented members from physical quorum", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...choices), { minLength: 3, maxLength: 50 }), (generatedChoices) => {
        const submission = publicSubmission(generatedChoices);
        if (submission.method !== "public") throw new Error("Expected a public ballot");
        const representedId = submission.participationEvidence.rosterMemberIds[2];
        const holderId = submission.participationEvidence.rosterMemberIds[1];
        const entries = submission.participationEvidence.attendance.map((entry) =>
          entry.memberId === representedId
            ? {
                ...entry,
                status: "represented" as const,
                proxyHolderMemberId: holderId,
                proxyDocumentId: "written-proxy",
              }
            : entry,
        );
        const proxied: BallotSubmission = {
          ...submission,
          votes: submission.votes.map((vote) =>
            vote.memberId === representedId ? { ...vote, castByMemberId: holderId } : vote,
          ),
          participationEvidence: participation(submission.participationEvidence.rosterMemberIds, entries),
        };
        expect(proxied.participationEvidence.quorum.physicallyPresent).toBe(generatedChoices.length - 1);
        expect(evaluateBallot(proxied)).toBe("recordable");
      }),
      { numRuns: 1_000 },
    );
  });

  it("rejects multiple proxies held by one member and proxies held by an absent member", () => {
    const memberIds = Array.from({ length: 5 }, (_, index) => memberId(index));
    const base = publicSubmission(["for", "for", "for", "for", "for"]);
    if (base.method !== "public") throw new Error("Expected a public ballot");
    const sameHolderEntries = attendance(memberIds).map((entry, index) =>
      index === 2 || index === 3
        ? {
            ...entry,
            status: "represented" as const,
            proxyHolderMemberId: memberIds[1],
            proxyDocumentId: `proxy-${index}`,
          }
        : entry,
    );
    const sameHolder: BallotSubmission = {
      ...base,
      votes: base.votes.map((vote, index) =>
        index === 2 || index === 3 ? { ...vote, castByMemberId: memberIds[1] } : vote,
      ),
      participationEvidence: participation(memberIds, sameHolderEntries),
    };
    expect(evaluateBallot(sameHolder)).toBe("proxyInvalid");

    const absentHolderEntries = attendance(memberIds).map((entry, index) => {
      if (index === 1) return { ...entry, status: "absent" as const };
      if (index === 2) {
        return {
          ...entry,
          status: "represented" as const,
          proxyHolderMemberId: memberIds[1],
          proxyDocumentId: "written-proxy",
        };
      }
      return entry;
    });
    const absentHolder: BallotSubmission = {
      ...base,
      secretaryMemberId: memberIds[3],
      votes: base.votes
        .filter((_, index) => index !== 1)
        .map((vote) => (vote.memberId === memberIds[2] ? { ...vote, castByMemberId: memberIds[1] } : vote)),
      participationEvidence: participation(memberIds, absentHolderEntries),
    };
    expect(evaluateBallot(absentHolder)).toBe("proxyInvalid");

    const unknownHolderEntries = attendance(memberIds).map((entry, index) =>
      index === 2
        ? {
            ...entry,
            status: "represented" as const,
            proxyHolderMemberId: "unknown-holder",
            proxyDocumentId: "written-proxy",
          }
        : entry,
    );
    expect(
      evaluateBallot({
        ...base,
        votes: base.votes.map((vote, index) => (index === 2 ? { ...vote, castByMemberId: "unknown-holder" } : vote)),
        participationEvidence: participation(memberIds, unknownHolderEntries),
      }),
    ).toBe("proxyInvalid");

    for (const status of ["present", "absent", "excused"] as const) {
      for (const metadata of [
        { proxyHolderMemberId: memberIds[1], proxyDocumentId: null },
        { proxyHolderMemberId: null, proxyDocumentId: "unexpected-proxy" },
        { proxyHolderMemberId: memberIds[1], proxyDocumentId: "unexpected-proxy" },
      ]) {
        const invalidMetadataEntries = attendance(memberIds).map((entry, index) =>
          index === 4 ? { ...entry, status, ...metadata } : entry,
        );
        expect(
          evaluateBallot({
            ...base,
            participationEvidence: participation(memberIds, invalidMetadataEntries),
          }),
        ).toBe("proxyInvalid");
      }
    }
  });

  it("derives only present and represented voters with their exact casting identity", () => {
    const memberIds = Array.from({ length: 4 }, (_, index) => memberId(index));
    const entries: AttendanceEvidence[] = [
      attendance(memberIds)[0],
      { ...attendance(memberIds)[1], status: "absent" },
      { ...attendance(memberIds)[2], status: "excused" },
      {
        ...attendance(memberIds)[3],
        status: "represented",
        proxyHolderMemberId: memberIds[0],
        proxyDocumentId: "written-proxy",
      },
    ];
    const submission: BallotSubmission = {
      type: "SUBMIT",
      meetingStatus: "inProgress",
      isReconvenedMeeting: true,
      chairMemberId: memberIds[0],
      secretaryMemberId: memberIds[0],
      recusedMemberIds: [],
      method: "secret",
      totals: { votesFor: 1, votesAgainst: 1, abstentions: 0, notVoting: 0 },
      participationEvidence: {
        rosterMemberIds: memberIds,
        attendance: entries,
        quorum: calculateQuorum(memberIds.length, entries, true),
      },
    };

    expect(deriveBallotVoters(submission)).toEqual([
      { kind: "present", memberId: memberIds[0], castByMemberId: memberIds[0] },
      {
        kind: "represented",
        memberId: memberIds[3],
        castByMemberId: memberIds[0],
        proxyDocumentId: "written-proxy",
      },
    ]);
    expect(evaluateBallot(submission)).toBe("recordable");

    for (const incompleteProxy of [
      { proxyHolderMemberId: memberIds[0], proxyDocumentId: null },
      { proxyHolderMemberId: null, proxyDocumentId: "written-proxy" },
    ]) {
      const malformed: BallotSubmission = {
        ...submission,
        participationEvidence: {
          ...submission.participationEvidence,
          attendance: submission.participationEvidence.attendance.map((entry) =>
            entry.memberId === memberIds[3] ? { ...entry, ...incompleteProxy } : entry,
          ),
        },
      };
      expect(deriveBallotVoters(malformed)).toEqual([
        { kind: "present", memberId: memberIds[0], castByMemberId: memberIds[0] },
      ]);
      expect(evaluateBallot(malformed)).toBe("proxyInvalid");
    }
  });

  it("accepts a valid recusal and rejects absent, duplicated or proxy-holder recusals", () => {
    const valid = publicSubmission(["for", "against", "abstain"]);
    if (valid.method !== "public") throw new Error("Expected a public ballot");
    const recusedId = valid.participationEvidence.rosterMemberIds[2];
    expect(
      evaluateBallot({
        ...valid,
        recusedMemberIds: [recusedId],
        votes: valid.votes.filter((vote) => vote.memberId !== recusedId),
      }),
    ).toBe("recordable");
    expect(evaluateBallot({ ...valid, recusedMemberIds: [recusedId, recusedId] })).toBe("recusalsInvalid");

    const absentEntries = valid.participationEvidence.attendance.map((entry) =>
      entry.memberId === recusedId ? { ...entry, status: "absent" as const } : entry,
    );
    expect(
      evaluateBallot({
        ...valid,
        recusedMemberIds: [recusedId],
        votes: valid.votes.filter((vote) => vote.memberId !== recusedId),
        participationEvidence: participation(valid.participationEvidence.rosterMemberIds, absentEntries),
      }),
    ).toBe("recusalsInvalid");

    const representedId = valid.participationEvidence.rosterMemberIds[2];
    const holderId = valid.participationEvidence.rosterMemberIds[1];
    const representedEntries = valid.participationEvidence.attendance.map((entry) =>
      entry.memberId === representedId
        ? {
            ...entry,
            status: "represented" as const,
            proxyHolderMemberId: holderId,
            proxyDocumentId: "written-proxy",
          }
        : entry,
    );
    expect(
      evaluateBallot({
        ...valid,
        recusedMemberIds: [holderId],
        votes: valid.votes
          .filter((vote) => vote.memberId !== holderId)
          .map((vote) => (vote.memberId === representedId ? { ...vote, castByMemberId: holderId } : vote)),
        participationEvidence: participation(valid.participationEvidence.rosterMemberIds, representedEntries),
      }),
    ).toBe("recusalsInvalid");

    expect(
      evaluateBallot({
        ...valid,
        recusedMemberIds: [representedId],
        votes: valid.votes.filter((vote) => vote.memberId !== representedId),
        participationEvidence: participation(valid.participationEvidence.rosterMemberIds, representedEntries),
      }),
    ).toBe("recordable");
  });

  it("requires each meeting officer to be identified and physically present", () => {
    const valid = publicSubmission(["for", "against", "abstain"]);
    expect(evaluateBallot({ ...valid, chairMemberId: null })).toBe("officersMissing");
    expect(evaluateBallot({ ...valid, secretaryMemberId: null })).toBe("officersMissing");
    expect(evaluateBallot({ ...valid, chairMemberId: "unknown-chair" })).toBe("officersMissing");
    expect(evaluateBallot({ ...valid, secretaryMemberId: "unknown-secretary" })).toBe("officersMissing");
    if (!valid.chairMemberId || !valid.secretaryMemberId) throw new Error("Expected meeting officers");
    for (const officerId of [valid.chairMemberId, valid.secretaryMemberId]) {
      const entries = valid.participationEvidence.attendance.map((entry) =>
        entry.memberId === officerId ? { ...entry, status: "absent" as const } : entry,
      );
      expect(
        evaluateBallot({
          ...valid,
          participationEvidence: participation(valid.participationEvidence.rosterMemberIds, entries),
        }),
      ).toBe("officersMissing");
    }
  });

  it("rejects inconsistent quorum evidence and malformed attendance sets", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 80 }), (size) => {
        const submission = publicSubmission(Array.from({ length: size }, () => "for" as const));
        const corruptEvidence = {
          ...submission.participationEvidence,
          quorum: {
            ...submission.participationEvidence.quorum,
            physicallyPresent: submission.participationEvidence.quorum.physicallyPresent - 1,
          },
        };
        expect(isQuorumEvidenceConsistent(corruptEvidence, false)).toBe(false);
        expect(evaluateBallot({ ...submission, participationEvidence: corruptEvidence })).toBe("quorumEvidenceInvalid");

        const duplicateAttendance = {
          ...submission.participationEvidence,
          attendance: [...submission.participationEvidence.attendance, submission.participationEvidence.attendance[0]],
        };
        expect(isAttendanceComplete(duplicateAttendance)).toBe(false);
      }),
      { numRuns: 500 },
    );

    const valid = publicSubmission(["for", "against"]);
    expect(isAttendanceComplete({ ...valid.participationEvidence, rosterMemberIds: [], attendance: [] })).toBe(false);
    expect(
      isAttendanceComplete({
        ...valid.participationEvidence,
        rosterMemberIds: [memberId(0), memberId(0)],
      }),
    ).toBe(false);
    expect(
      isAttendanceComplete({
        ...valid.participationEvidence,
        attendance: [
          valid.participationEvidence.attendance[0],
          { ...valid.participationEvidence.attendance[1], memberId: "outsider" },
        ],
      }),
    ).toBe(false);
    for (const quorum of [
      { ...valid.participationEvidence.quorum, activeMembers: 99 },
      { ...valid.participationEvidence.quorum, physicallyPresent: 0 },
      { ...valid.participationEvidence.quorum, required: 99 },
      { ...valid.participationEvidence.quorum, reached: false },
    ]) {
      expect(isQuorumEvidenceConsistent({ ...valid.participationEvidence, quorum }, false)).toBe(false);
    }
  });

  it("covers every reachable ballot state through generated XState shortest paths", () => {
    const valid = publicSubmission(["for", "against"]);
    const validWithThird = publicSubmission(["for", "against", "abstain"]);
    const incomplete: BallotSubmission = {
      ...valid,
      participationEvidence: {
        ...valid.participationEvidence,
        attendance: valid.participationEvidence.attendance.slice(0, 1),
      },
    };
    const noQuorumEntries = valid.participationEvidence.attendance.map((entry, index) => ({
      ...entry,
      status: index === 0 ? ("present" as const) : ("absent" as const),
    }));
    const noQuorum: BallotSubmission = {
      ...valid,
      participationEvidence: participation(valid.participationEvidence.rosterMemberIds, noQuorumEntries),
    };
    const events = [
      valid,
      { ...valid, meetingStatus: "scheduled" as const },
      incomplete,
      {
        ...valid,
        participationEvidence: {
          ...valid.participationEvidence,
          quorum: { ...valid.participationEvidence.quorum, activeMembers: 99 },
        },
      },
      noQuorum,
      { ...valid, chairMemberId: null },
      {
        ...validWithThird,
        participationEvidence: {
          ...validWithThird.participationEvidence,
          attendance: validWithThird.participationEvidence.attendance.map((entry, index) =>
            index === 2
              ? {
                  ...entry,
                  status: "represented" as const,
                  proxyHolderMemberId: validWithThird.participationEvidence.rosterMemberIds[1],
                  proxyDocumentId: null,
                }
              : entry,
          ),
          quorum: {
            activeMembers: 3,
            physicallyPresent: 2,
            required: 2,
            reached: true,
          },
        },
      },
      {
        ...validWithThird,
        recusedMemberIds: [
          validWithThird.participationEvidence.rosterMemberIds[2],
          validWithThird.participationEvidence.rosterMemberIds[2],
        ],
      },
      { ...valid, votes: valid.method === "public" ? valid.votes.slice(1) : [] },
      { type: "RECORD" as const },
      { type: "CANCEL" as const, meetingStatus: "inProgress" as const },
    ];
    const reached = new Set(getShortestPaths(ballotMachine, { events }).map((path) => String(path.state.value)));
    expect(reached).toEqual(
      new Set([
        "draft",
        "recordable",
        "recorded",
        "cancelled",
        "meetingNotInProgress",
        "attendanceIncomplete",
        "quorumEvidenceInvalid",
        "quorumNotReached",
        "officersMissing",
        "proxyInvalid",
        "recusalsInvalid",
        "votesInvalid",
      ]),
    );
  });
});
