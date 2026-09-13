import { describe, expect, it } from "vitest";
import { compileQuery } from "../infrastructure/database/executor.js";

describe("named SQL queries", () => {
  it("compiles named parameters for PostgreSQL", () => {
    expect(compileQuery("meeting.find", "postgres", { reference: "meeting-1" })).toEqual({
      text: "SELECT * FROM council_meetings WHERE id = $1 OR slug = $2",
      values: ["meeting-1", "meeting-1"],
    });
  });

  it("selects dialect overrides and rejects missing parameters", () => {
    expect(compileQuery("councilBusiness.list", "postgres", { folderPath: null }).text).toContain("CAST($1 AS text)");
    expect(() => compileQuery("meeting.find", "postgres")).toThrow("Missing SQL parameter :reference");
  });
});
