import { describe, expect, it } from "vitest";
import { councilDecisionContentCanChange } from "./councilDecisionMachine.js";

describe("council decision content policy", () => {
  it.each([
    ["draft", true],
    ["ready", true],
    ["scheduled", true],
    ["adopted", false],
    ["rejected", false],
    ["enforceable", false],
  ] as const)("defines whether %s content can change", (status, expected) => {
    expect(councilDecisionContentCanChange(status)).toBe(expected);
  });
});
