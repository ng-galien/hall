import { describe, expect, it } from "vitest";
import { asInteger, asNullableNumber, asNullableString, asString } from "./row.js";

describe("persisted row decoding", () => {
  it("names the field and the expected type when a persisted value does not decode", () => {
    expect(() => asString(42, "settings.name")).toThrow(
      "Invalid persisted settings.name: expected a string, received 42",
    );
    expect(() => asInteger("1.5", "settings.version")).toThrow(
      "Invalid persisted settings.version: expected a safe integer, received 1.5",
    );
    expect(() => asNullableNumber("", "settings.latitude")).toThrow(
      "Invalid persisted settings.latitude: expected a finite number, received ",
    );
    expect(asNullableString(null)).toBeNull();
    expect(asInteger("-12")).toBe(-12);
  });
});
