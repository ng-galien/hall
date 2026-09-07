import { describe, expect, it } from "vitest";
import {
  councilDecisionFactsSchema,
  councilDecisionSummarySchema,
  updateCouncilDecisionDraftSchema,
} from "./councilDecisionDocument.js";

describe("documentary decision boundaries", () => {
  it("rejects attempts to rewrite facts or a publication number through draft editing", () => {
    expect(
      updateCouncilDecisionDraftSchema.safeParse({ expectedVersion: 1, content: "Faithful wording" }).success,
    ).toBe(true);
    for (const forbidden of [{ facts: {} }, { publicationNumber: "2026-09-001" }, { title: "Different question" }]) {
      expect(
        updateCouncilDecisionDraftSchema.safeParse({ expectedVersion: 1, content: "Text", ...forbidden }).success,
      ).toBe(false);
    }
  });
  it("requires a retained document identity for the frozen state", () => {
    const summary = {
      id: "00000000-0000-4000-8000-000000000001",
      councilMeetingId: "00000000-0000-4000-8000-000000000002",
      proposalId: "00000000-0000-4000-8000-000000000003",
      ballotId: "00000000-0000-4000-8000-000000000004",
      title: "Object",
      publicationNumber: null,
      version: 1,
      createdAt: "2026-09-07T10:00:00Z",
      updatedAt: "2026-09-07T10:00:00Z",
      frozenAt: null,
      documentId: null,
    };
    expect(councilDecisionSummarySchema.safeParse({ ...summary, state: "draft" }).success).toBe(true);
    expect(councilDecisionSummarySchema.safeParse({ ...summary, state: "frozen" }).success).toBe(false);
  });
  it("refuses individual choices on a secret ballot", () => {
    const ballot = councilDecisionFactsSchema.shape.ballot;
    const secret = {
      id: "00000000-0000-4000-8000-000000000001",
      mode: "secret",
      result: "reject",
      totals: { approve: 0, reject: 1, abstain: 0, blank: 0, invalid: 0, nonParticipation: 0 },
    };
    expect(ballot.safeParse(secret).success).toBe(true);
    expect(ballot.safeParse({ ...secret, votes: [] }).success).toBe(false);
  });
});
