import { describe, expect, it } from "vitest";
import { ballotResultPreviewSchema, createBallotResultPreviewSchema } from "./ballotResultPreview.js";

const agendaItemId = "11111111-1111-4111-8111-111111111111";
const chairmanAttendanceId = "22222222-2222-4222-8222-222222222222";
const otherAttendanceId = "33333333-3333-4333-8333-333333333333";
const memberId = "44444444-4444-4444-8444-444444444444";
const time = "2026-10-03T18:00:00+02:00";

const publicCandidate = {
  procedure: "ordinaryMajority",
  mode: "public",
  participantAttendanceIds: [chairmanAttendanceId, otherAttendanceId],
  votes: [
    { meetingAttendanceId: chairmanAttendanceId, choice: "approve" },
    { meetingAttendanceId: otherAttendanceId, choice: "reject" },
  ],
};

describe("ballot result preview commands", () => {
  it("defaults public non-participations to none", () => {
    const parsed = createBallotResultPreviewSchema.parse({ agendaItemId, candidate: publicCandidate });
    expect(parsed.candidate.mode === "public" && parsed.candidate.nonParticipations).toEqual([]);
  });

  it("defaults secret blank, invalid and non-participation totals to zero", () => {
    const parsed = createBallotResultPreviewSchema.parse({
      agendaItemId,
      candidate: {
        procedure: "ordinaryMajority",
        mode: "secret",
        participantAttendanceIds: [chairmanAttendanceId],
        totals: { approve: 1, reject: 0, abstain: 0 },
      },
    });
    expect(parsed.candidate.mode === "secret" && parsed.candidate.totals).toEqual({
      approve: 1,
      reject: 0,
      abstain: 0,
      blank: 0,
      invalid: 0,
      nonParticipation: 0,
    });
  });

  // @verifies-requirement HALL-FR-BAL-140
  it("rejects a submitted candidate that names the ballot chair", () => {
    expect(() =>
      createBallotResultPreviewSchema.parse({ agendaItemId, candidate: { ...publicCandidate, chairmanAttendanceId } }),
    ).toThrow();
  });

  it("rejects individual votes in a secret ballot", () => {
    expect(() =>
      createBallotResultPreviewSchema.parse({
        agendaItemId,
        candidate: { ...publicCandidate, mode: "secret", totals: { approve: 1, reject: 1, abstain: 0 } },
      }),
    ).toThrow();
  });

  it("rejects a candidate without participants, an unknown procedure or a negative total", () => {
    expect(() =>
      createBallotResultPreviewSchema.parse({
        agendaItemId,
        candidate: { ...publicCandidate, participantAttendanceIds: [] },
      }),
    ).toThrow();
    expect(() =>
      createBallotResultPreviewSchema.parse({
        agendaItemId,
        candidate: { ...publicCandidate, procedure: "absoluteMajority" },
      }),
    ).toThrow();
    expect(() =>
      createBallotResultPreviewSchema.parse({
        agendaItemId,
        candidate: {
          procedure: "ordinaryMajority",
          mode: "secret",
          participantAttendanceIds: [chairmanAttendanceId],
          totals: { approve: -1, reject: 0, abstain: 0 },
        },
      }),
    ).toThrow();
  });
});

describe("ballot result preview", () => {
  const preview = {
    id: "55555555-5555-4555-8555-555555555555",
    agendaItemId,
    canConfirm: true,
    revision: 1,
    candidate: { ...publicCandidate, chairmanAttendanceId, nonParticipations: [] },
    calculation: {
      tieBreakApplied: true,
      result: "approve",
      totals: { approve: 1, reject: 1, abstain: 0, blank: 0, invalid: 0, nonParticipation: 0 },
      expressedCount: 2,
      participantCount: 2,
    },
    quorum: {
      membershipRecordId: "66666666-6666-4666-8666-666666666666",
      membersInOffice: [{ councilMemberId: memberId, name: "Camille Martin" }],
      membershipObservedAt: time,
      membershipSourceReference: "Tableau du conseil",
      memberCount: 1,
      excludedMemberIds: [],
      denominatorExcludedMemberIds: [],
      denominator: 1,
      requiredPresent: 1,
      presentMemberIds: [memberId],
      presentCount: 1,
      regime: "ordinary",
      verdict: "met",
      reconvocationId: null,
      attendance: [],
      remainingAgendaItemIds: [agendaItemId],
    },
    createdAt: time,
    createdBy: "secretary",
  };

  it("accepts a calculated preview with its quorum facts", () => {
    expect(ballotResultPreviewSchema.parse(preview)).toEqual(preview);
  });

  it("requires the ballot chair determined by the meeting in a reviewed candidate", () => {
    const { chairmanAttendanceId: _chair, ...candidate } = preview.candidate;
    expect(() => ballotResultPreviewSchema.parse({ ...preview, candidate })).toThrow();
  });

  it("rejects a revision below one and an undecided result", () => {
    expect(() => ballotResultPreviewSchema.parse({ ...preview, revision: 0 })).toThrow();
    expect(() =>
      ballotResultPreviewSchema.parse({ ...preview, calculation: { ...preview.calculation, result: "tie" } }),
    ).toThrow();
  });
});
