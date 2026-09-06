import { describe, expect, it } from "vitest";
import { agendaBusinessRank, agendaItemIsOpen, isAgendaBusinessOrderValid } from "./agendaOrderPolicy.js";
import { councilBusinessHasDecision, councilBusinessIsMatter } from "./councilBusinessPolicy.js";
import type { CouncilBusiness } from "./model.js";

const business = (kind: CouncilBusiness["kind"], councilDecisionId: string | null = null): CouncilBusiness =>
  ({
    id: `${kind}-${councilDecisionId ?? "none"}`,
    slug: kind,
    kind,
    title: kind,
    report: "",
    folderPath: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...(kind === "matter" ? { councilDecisionId, committeeId: null } : {}),
    ...(kind === "minutesApproval" ? { minutesOfMeetingId: "previous-meeting" } : {}),
  }) as CouncilBusiness;

describe("agenda order policy", () => {
  it("orders minutes, voting matters, informational matters, then open questions", () => {
    const ordered = [
      business("minutesApproval"),
      business("matter", "decision"),
      business("matter"),
      business("openQuestion"),
    ];

    expect(ordered.map(agendaBusinessRank)).toEqual([0, 1, 2, 3]);
    expect(isAgendaBusinessOrderValid(ordered)).toBe(true);
    expect(isAgendaBusinessOrderValid([ordered[0], ordered[2], ordered[1], ordered[3]])).toBe(false);
    expect(isAgendaBusinessOrderValid([ordered[0], ordered[3], ordered[2]])).toBe(false);
  });

  it.each([
    ["scheduled", true],
    ["inProgress", true],
    ["examined", false],
    ["postponed", false],
    ["withdrawn", false],
  ] as const)("defines whether %s is an open occurrence", (status, expected) => {
    expect(agendaItemIsOpen(status)).toBe(expected);
  });

  it.each([
    ["matter", true],
    ["minutesApproval", false],
    ["openQuestion", false],
  ] as const)("defines whether %s is a council matter", (kind, expected) => {
    expect(councilBusinessIsMatter(business(kind))).toBe(expected);
  });

  it("distinguishes council matters backed by a decision", () => {
    expect(councilBusinessHasDecision(business("matter", "decision"))).toBe(true);
    expect(councilBusinessHasDecision(business("matter"))).toBe(false);
  });
});
