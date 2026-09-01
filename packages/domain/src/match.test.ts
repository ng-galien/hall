import { describe, expect, it } from "vitest";
import { defineExhaustiveLiterals, matchDiscriminated, matchLiteral, matchVariant } from "./match.js";

function compileOnlyRejectsMismatchedVariant() {
  matchVariant({ properties: { kind: "circle" as const }, radius: 1 }, "properties", "kind", {
    // @ts-expect-error A circle cannot be dispatched through a square handler.
    square: (value: { properties: { kind: "square" }; side: number }) => value.side,
  });
}

void compileOnlyRejectsMismatchedVariant;

describe("closed union matchers", () => {
  it("selects the correlated handler for a discriminated union", () => {
    type Value = { kind: "text"; text: string } | { kind: "count"; count: number };
    const render = (value: Value) =>
      matchDiscriminated(value, "kind", {
        text: (entry) => entry.text,
        count: (entry) => String(entry.count),
      });
    expect(render({ kind: "count", count: 3 })).toBe("3");
  });

  it("selects the handler for a closed literal union", () => {
    const choose = (value: "left" | "right") => matchLiteral(value, { left: () => 1, right: () => 2 });
    expect(choose("right")).toBe(2);
  });

  it("keeps an exhaustive literal catalog unchanged at runtime", () => {
    const values = defineExhaustiveLiterals<"left" | "right">()(["left", "right"] as const);
    expect(values).toEqual(["left", "right"]);
  });
});
