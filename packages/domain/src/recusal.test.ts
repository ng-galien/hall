import { describe, expect, it } from "vitest";
import { agendaItemRecusalSchema, agendaItemRecusalStateSchema, recordAgendaItemRecusalSchema } from "./recusal.js";

const memberId = "11111111-1111-4111-8111-111111111111";
const command = {
  councilMemberId: memberId,
  legalBasis: "personalInterest",
};
const recusal = {
  ...command,
  declaredAt: "2026-10-03T18:00:00+02:00",
  id: "22222222-2222-4222-8222-222222222222",
  agendaItemId: "33333333-3333-4333-8333-333333333333",
  recordedAt: "2026-10-03T18:01:00+02:00",
  recordedBy: "secretary",
  memberName: "Camille Martin",
};

describe("agenda item recusal", () => {
  it("offers exactly the two declared legal bases", () => {
    for (const legalBasis of ["personalInterest", "designatedRepresentativeConflict"]) {
      expect(recordAgendaItemRecusalSchema.parse({ ...command, legalBasis }).legalBasis).toBe(legalBasis);
    }
  });

  it("requires an explicit legal basis", () => {
    expect(recordAgendaItemRecusalSchema.parse(command)).toEqual(command);
    expect(() => recordAgendaItemRecusalSchema.parse({ ...command, legalBasis: undefined })).toThrow();
    expect(() => recordAgendaItemRecusalSchema.parse({ ...command, legalBasis: "other" })).toThrow();
  });

  it("rejects undeclared fields and a client declaration instant", () => {
    expect(() => recordAgendaItemRecusalSchema.parse({ ...command, reason: "x" })).toThrow();
    expect(() =>
      recordAgendaItemRecusalSchema.parse({ ...command, declaredAt: "2026-10-03T18:00:00+02:00" }),
    ).toThrow();
    expect(() => agendaItemRecusalSchema.parse({ ...recusal, declaredAt: "2026-10-03T18:00:00" })).toThrow();
  });

  it("accepts a recorded recusal and its quorum impact", () => {
    const state = {
      recusals: [agendaItemRecusalSchema.parse(recusal)],
      eligibleParticipantAttendanceIds: [],
      departedParticipantAttendanceIds: [],
      quorumImpact: { excludedMemberIds: [memberId], denominatorReduction: 1, eligibleDeclaredPresentMemberIds: [] },
      canRecordRecusal: false,
      canWithdrawRecusal: false,
    };
    expect(agendaItemRecusalStateSchema.parse(state)).toEqual(state);
    expect(() =>
      agendaItemRecusalStateSchema.parse({
        ...state,
        quorumImpact: { ...state.quorumImpact, denominatorReduction: -1 },
      }),
    ).toThrow();
  });
});
