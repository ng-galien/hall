import { describe, expect, it } from "vitest";
import { agendaBusinessRank, isAgendaBusinessOrderValid } from "./agendaOrderPolicy.js";
import type { CouncilBusiness } from "./model.js";

const business = (kind: CouncilBusiness["kind"], councilDecisionId: string | null = null): CouncilBusiness =>
  ({
    id: `${kind}-${councilDecisionId ?? "none"}`,
    slug: kind,
    kind,
    title: kind,
    report: "",
    folderPath: "",
    resources: [],
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
});
