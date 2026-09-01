import { describe, expect, it } from "vitest";
import { ballotTargetOf, storedBallotTarget } from "./ballotPolicy.js";

describe("ballot target policy", () => {
  it.each([
    [
      { councilDecisionId: "decision", agendaItemId: null },
      { kind: "councilDecision", id: "decision" },
    ],
    [
      { councilDecisionId: null, agendaItemId: "item" },
      { kind: "agendaItem", id: "item" },
    ],
  ] as const)("normalizes the storage representation", (stored, target) => {
    expect(ballotTargetOf(stored)).toEqual(target);
    expect(storedBallotTarget(target)).toEqual(stored);
  });

  it.each([
    { councilDecisionId: null, agendaItemId: null },
    { councilDecisionId: "decision", agendaItemId: "item" },
  ])("rejects an ambiguous target", (stored) => {
    expect(() => ballotTargetOf(stored)).toThrow("exactly one");
  });
});
