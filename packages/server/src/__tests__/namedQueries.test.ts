import { describe, expect, it } from "vitest";
import { compileQuery } from "../infrastructure/database/executor.js";

describe("named SQL queries", () => {
  it("compiles named parameters for PostgreSQL", () => {
    expect(compileQuery("security.findUserById", "postgres", { value: "user-1" })).toEqual({
      text: "SELECT * FROM users WHERE id = $1",
      values: ["user-1"],
    });
  });

  it("selects dialect overrides and rejects missing parameters", () => {
    expect(compileQuery("security.lockUserForAuthentication", "postgres", { value: "user-1" }).text).toContain(
      "FOR UPDATE",
    );
    expect(() => compileQuery("security.findUserById", "postgres")).toThrow("Missing SQL parameter :value");
  });
});
