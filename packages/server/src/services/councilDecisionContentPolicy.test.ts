import { describe, expect, it, vi } from "vitest";
import type { AgendaItemRepository, CouncilMeetingRepository } from "../repositories/contracts.js";
import { councilBusinessDecisionBindingIsFrozen } from "./councilDecisionContentPolicy.js";

function repositories(
  occurrences: Array<{ status: "scheduled" | "inProgress" | "examined"; meetingId: string }>,
  meeting: { quorumFailure: object | null; isReconvenedMeeting: boolean } | null = null,
) {
  const findMeeting = vi.fn(async () => meeting);
  return {
    agendaItemRepository: {
      listForBusiness: async () => occurrences,
    } as unknown as AgendaItemRepository,
    councilMeetingRepository: {
      find: findMeeting,
    } as unknown as CouncilMeetingRepository,
    findMeeting,
  };
}

describe("council business decision binding policy", () => {
  it("freezes an occurrence already in progress without loading its meeting", async () => {
    const { findMeeting, ...repos } = repositories([{ status: "inProgress", meetingId: "meeting" }]);
    await expect(councilBusinessDecisionBindingIsFrozen("business", repos)).resolves.toBe(true);
    expect(findMeeting).not.toHaveBeenCalled();
  });

  it("freezes a scheduled occurrence only under the exceptional meeting regimes", async () => {
    const occurrence = [{ status: "scheduled" as const, meetingId: "meeting" }];
    await expect(
      councilBusinessDecisionBindingIsFrozen(
        "business",
        repositories(occurrence, { quorumFailure: null, isReconvenedMeeting: false }),
      ),
    ).resolves.toBe(false);
    await expect(
      councilBusinessDecisionBindingIsFrozen(
        "business",
        repositories(occurrence, { quorumFailure: {}, isReconvenedMeeting: false }),
      ),
    ).resolves.toBe(true);
  });

  it("ignores closed occurrences", async () => {
    const { findMeeting, ...repos } = repositories([{ status: "examined", meetingId: "meeting" }]);
    await expect(councilBusinessDecisionBindingIsFrozen("business", repos)).resolves.toBe(false);
    expect(findMeeting).not.toHaveBeenCalled();
  });
});
