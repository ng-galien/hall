import { describe, expect, it } from "vitest";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import { createBallotRepository } from "../repositories/ballotRepository.js";
import { mapCouncilBusiness } from "../repositories/councilBusinessRepository.js";
import { parseParticipationEvidence, parseQuorumFailureEvidence } from "../repositories/evidenceMapping.js";

const commonBusinessRow = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "business",
  title: "Business",
  report: "Report",
  folder_path: "seed",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("persistence decoding", () => {
  it("rejects an unknown council-business discriminant", () => {
    expect(() => mapCouncilBusiness({ ...commonBusinessRow, kind: "unknown" })).toThrow();
  });

  it("rejects an unknown ballot method instead of decoding it as public", async () => {
    let method = "unknown";
    let result = "adopted";
    let councilDecisionId: string | null = null;
    let agendaItemId: string | null = "55555555-5555-4555-8555-555555555555";
    let votesFor: unknown = 1;
    let chairTieBreakApplied: unknown = 0;
    let recusedMemberIdsJson = "[]";
    let persistedVotes: Record<string, unknown>[] = [];
    const executor = {
      all: async (name: string) => {
        if (name === "ballot.listByMeeting") {
          return [
            {
              id: "33333333-3333-4333-8333-333333333333",
              meeting_id: "44444444-4444-4444-8444-444444444444",
              council_decision_id: councilDecisionId,
              agenda_item_id: agendaItemId,
              method,
              result,
              votes_for: votesFor,
              votes_against: 0,
              abstentions: 0,
              not_voting: 0,
              chair_tie_break_applied: chairTieBreakApplied,
              recused_member_ids_json: recusedMemberIdsJson,
              participation_evidence_json: JSON.stringify({
                rosterMemberIds: [],
                attendance: [],
                quorum: { activeMembers: 0, physicallyPresent: 0, required: 1, reached: false },
              }),
              created_at: "2026-01-01T00:00:00.000Z",
              cancelled_at: null,
            },
          ];
        }
        if (name === "ballot.votes") return persistedVotes;
        throw new Error(`Unexpected query ${name}`);
      },
    } as unknown as SqlExecutor;

    const repository = createBallotRepository({ sqlExecutor: executor });
    await expect(repository.listForMeeting("meeting")).rejects.toThrow();

    method = "secret";
    result = "unknown";
    await expect(repository.listForMeeting("meeting")).rejects.toThrow();

    result = "adopted";
    recusedMemberIdsJson = "{not-json";
    await expect(repository.listForMeeting("meeting")).rejects.toThrow();

    method = "public";
    recusedMemberIdsJson = "[]";
    persistedVotes = [
      {
        id: "66666666-6666-4666-8666-666666666666",
        ballot_id: "33333333-3333-4333-8333-333333333333",
        member_id: "77777777-7777-4777-8777-777777777777",
        cast_by_member_id: "77777777-7777-4777-8777-777777777777",
        choice: "unknown",
      },
    ];
    await expect(repository.listForMeeting("meeting")).rejects.toThrow();

    persistedVotes = [];
    councilDecisionId = null;
    agendaItemId = null;
    await expect(repository.listForMeeting("meeting")).rejects.toThrow("exactly one");

    councilDecisionId = "88888888-8888-4888-8888-888888888888";
    agendaItemId = "55555555-5555-4555-8555-555555555555";
    await expect(repository.listForMeeting("meeting")).rejects.toThrow("exactly one");

    councilDecisionId = null;
    votesFor = "1.5";
    await expect(repository.listForMeeting("meeting")).rejects.toThrow("safe integer");

    votesFor = 1;
    chairTieBreakApplied = "false";
    await expect(repository.listForMeeting("meeting")).rejects.toThrow("boolean or 0/1");
  });

  it("rejects a silently coercible persisted business primitive", () => {
    expect(() => mapCouncilBusiness({ ...commonBusinessRow, kind: "openQuestion", report: false })).toThrow(
      "council_business.report",
    );
  });

  it("rejects malformed persisted participation evidence", () => {
    expect(() => parseParticipationEvidence("{not-json")).toThrow();
    expect(() =>
      parseParticipationEvidence(
        JSON.stringify({
          rosterMemberIds: [],
          attendance: [{ memberId: "not-an-id", status: "teleported" }],
          quorum: { activeMembers: "zero", physicallyPresent: 0, required: 1, reached: false },
        }),
      ),
    ).toThrow();
    expect(() =>
      parseQuorumFailureEvidence(
        JSON.stringify({
          rosterMemberIds: [],
          attendance: [],
          quorum: { activeMembers: 0, physicallyPresent: 0, required: 0, reached: false },
          recordedAt: "not-a-date",
        }),
      ),
    ).toThrow();
  });

});
