import { describe, expect, it } from "vitest";
import { recordAttendanceSchema, recordBallotSchema } from "./schemas.js";

describe("recordBallotSchema", () => {
  it("keeps named votes for a public ballot", () => {
    const memberId = "11111111-1111-4111-8111-111111111111";
    const result = recordBallotSchema.parse({
      method: "public",
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      councilDecisionId: "22222222-2222-4222-8222-222222222222",
      votes: [{ memberId, castByMemberId: memberId, choice: "for" }],
    });
    expect(result.method).toBe("public");
  });

  it("keeps only totals for a secret ballot", () => {
    const result = recordBallotSchema.parse({
      method: "secret",
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      councilDecisionId: "22222222-2222-4222-8222-222222222222",
      totals: { votesFor: 5, votesAgainst: 2, abstentions: 1 },
    });
    expect(result).toMatchObject({ method: "secret", totals: { notVoting: 0 } });
  });
});

describe("meeting command schemas", () => {
  it("requires both the holder and document for a represented member", () => {
    expect(() =>
      recordAttendanceSchema.parse({
        memberId: "11111111-1111-4111-8111-111111111111",
        status: "represented",
        proxyHolderMemberId: "22222222-2222-4222-8222-222222222222",
        proxyDocumentId: null,
      }),
    ).toThrow();
  });
});
