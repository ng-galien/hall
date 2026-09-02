import { describe, expect, it } from "vitest";
import { compileQuery } from "../infrastructure/database/executor.js";

describe("named SQL queries", () => {
  it("compiles named parameters for each supported dialect", () => {
    expect(compileQuery("meeting.find", "sqlite", { reference: "meeting-1" })).toEqual({
      text: "SELECT * FROM council_meetings WHERE id = ? OR slug = ?",
      values: ["meeting-1", "meeting-1"],
    });
    expect(compileQuery("meeting.find", "postgres", { reference: "meeting-1" })).toEqual({
      text: "SELECT * FROM council_meetings WHERE id = $1 OR slug = $2",
      values: ["meeting-1", "meeting-1"],
    });
  });

  it("selects dialect overrides and rejects missing parameters", () => {
    expect(compileQuery("member.listActive", "postgres").text).toContain("term_ended_on IS NULL");
    expect(() => compileQuery("meeting.find", "sqlite")).toThrow("Missing SQL parameter :reference");
  });
});
