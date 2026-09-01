import { describe, expect, it } from "vitest";
import {
  councilBusinessAgendaProfile,
  councilBusinessCanCarryForwardAfterPostponement,
} from "./councilBusinessPolicy.js";
import type { CouncilBusiness } from "./model.js";

const common = {
  id: "business-1",
  slug: "business-1",
  title: "Business",
  report: "",
  folderPath: "",
  resources: [],
  createdAt: "2026-08-31T00:00:00.000Z",
  updatedAt: "2026-08-31T00:00:00.000Z",
};

describe("council business agenda profile", () => {
  it.each([
    [
      { kind: "minutesApproval", ...common, minutesOfMeetingId: "meeting-1" },
      { role: "minutesApproval", rank: 0, decision: null, committee: null, minutes: "meeting-1", ballot: "agendaItem" },
    ],
    [
      { kind: "matter", ...common, councilDecisionId: "decision-1", committeeId: null },
      { role: "decision", rank: 1, decision: "decision-1", committee: null, minutes: null, ballot: "decision" },
    ],
    [
      { kind: "matter", ...common, councilDecisionId: null, committeeId: null },
      { role: "information", rank: 2, decision: null, committee: null, minutes: null, ballot: "agendaItem" },
    ],
    [
      { kind: "openQuestion", ...common },
      { role: "openQuestion", rank: 3, decision: null, committee: null, minutes: null, ballot: null },
    ],
  ] as const)("projects $kind", (business, expected) => {
    const profile = councilBusinessAgendaProfile(business as CouncilBusiness);
    expect({
      role: profile.role,
      rank: profile.rank,
      decision: profile.councilDecisionId,
      committee: profile.committeeId,
      minutes: profile.minutesOfMeetingId,
      ballot: profile.ballotTarget,
    }).toEqual(expected);
  });

  it.each([
    [{ kind: "minutesApproval", ...common, minutesOfMeetingId: "meeting-1" }, false],
    [{ kind: "matter", ...common, councilDecisionId: "decision-1", committeeId: null }, true],
    [{ kind: "matter", ...common, councilDecisionId: null, committeeId: null }, true],
    [{ kind: "openQuestion", ...common }, true],
  ] as const)("decides whether $kind can be carried forward after postponement", (business, expected) => {
    expect(councilBusinessCanCarryForwardAfterPostponement(business as CouncilBusiness)).toBe(expected);
  });
});
