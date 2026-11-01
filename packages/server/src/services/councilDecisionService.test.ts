import type { CouncilDecisionDetail } from "@hall/contracts";
import { jinjaBody } from "@hall/domain";
import { describe, expect, it, vi } from "vitest";
import type { CouncilDecisionClient } from "../clients/councilDecisionClient.js";
import type { ContentTemplateService } from "./contentTemplateService.js";
import { createCouncilDecisionService } from "./councilDecisionService.js";
import { DomainError } from "./errors.js";

const draft = {
  id: "decision",
  state: "draft",
  version: 1,
  number: "2026-09-01",
  documentDate: "2026-09-07",
} as CouncilDecisionDetail;
function setup() {
  const open = vi.fn().mockResolvedValue(draft);
  const freeze = vi.fn();
  const generate = vi.fn(async (_template, input) => ({
    content: Buffer.from(`${input.councilDecision.number}/${input.councilDecision.documentDate}`),
  }));
  const service = createCouncilDecisionService({
    councilDecisionClient: { open, freeze } as unknown as CouncilDecisionClient,
    contentTemplateService: {
      list: async () => [
        {
          kind: "pdf",
          documentType: "council-decision",
          bodyMarkdown: jinjaBody("council-decision"),
        },
      ],
      generateFromTemplate: generate,
    } as unknown as ContentTemplateService,
  });
  return { service, open, freeze, generate };
}
describe("documentary number and date at freeze", () => {
  it("renders again after another draft consumes the candidate or the day changes", async () => {
    const { service, open, freeze, generate } = setup();
    const current = { ...draft, number: "2026-09-02", documentDate: "2026-09-08" };
    open.mockResolvedValueOnce(draft).mockResolvedValue(current);
    const frozen = { ...current, state: "frozen" };
    freeze.mockRejectedValueOnce(new DomainError("council_decision_number_changed", 409)).mockResolvedValue(frozen);
    expect(await service.freeze(draft.id, { expectedVersion: 1 })).toEqual(frozen);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(freeze).toHaveBeenNthCalledWith(
      2,
      draft.id,
      1,
      "2026-09-02",
      "2026-09-08",
      Buffer.from("2026-09-02/2026-09-08"),
    );
  });
  it("returns the retained result on a retry without rendering or allocating again", async () => {
    const { service, open, freeze, generate } = setup();
    const frozen = { ...draft, state: "frozen" };
    open.mockResolvedValue(frozen);
    expect(await service.freeze(draft.id, { expectedVersion: 1 })).toEqual(frozen);
    expect(generate).not.toHaveBeenCalled();
    expect(freeze).not.toHaveBeenCalled();
  });
  it("does not allocate after a rendering failure or silently accept an editorial conflict", async () => {
    const { service, open, freeze, generate } = setup();
    generate.mockRejectedValueOnce(new Error("PDF rendering failed"));
    await expect(service.freeze(draft.id, { expectedVersion: 1 })).rejects.toThrow("PDF rendering failed");
    expect(freeze).not.toHaveBeenCalled();
    open.mockResolvedValue({ ...draft, version: 2 });
    await expect(service.freeze(draft.id, { expectedVersion: 1 })).rejects.toMatchObject({
      code: "council_decision_conflict",
    });
  });
});
