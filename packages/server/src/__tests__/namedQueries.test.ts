import { describe, expect, it } from "vitest";
import { compileQuery } from "../infrastructure/database/executor.js";

describe("named SQL queries", () => {
  it("compiles named parameters for each supported dialect", () => {
    expect(compileQuery("meeting.find", "sqlite", { id: "meeting-1" })).toEqual({
      text: "SELECT * FROM council_meetings WHERE id = ?",
      values: ["meeting-1"],
    });
    expect(compileQuery("meeting.find", "postgres", { id: "meeting-1" })).toEqual({
      text: "SELECT * FROM council_meetings WHERE id = $1",
      values: ["meeting-1"],
    });
  });

  it("selects dialect overrides and rejects missing parameters", () => {
    expect(compileQuery("member.listActive", "postgres").text).toContain("active = TRUE");
    expect(() => compileQuery("meeting.find", "sqlite")).toThrow("Missing SQL parameter :id");
  });
});
