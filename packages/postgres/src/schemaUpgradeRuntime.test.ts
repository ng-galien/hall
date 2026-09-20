import { describe, expect, it } from "vitest";
import {
  assertSchemaTargetDatabaseState,
  schemaTargetDatabaseMarker,
  schemaTargetDatabaseName,
} from "./schemaUpgradeRuntime.js";

describe("Hall PostgreSQL schema target identity", () => {
  it("uses a stable bounded database name and a source-specific ownership marker", () => {
    expect(schemaTargetDatabaseName("hall")).toBe("hall__hall_schema_target");
    expect(schemaTargetDatabaseMarker("hall")).toBe("hall-schema-target:v1:hall");

    const longName = "municipal-production-database-with-a-name-that-exceeds-postgresql-identifiers";
    expect(Buffer.byteLength(schemaTargetDatabaseName(longName), "utf8")).toBeLessThanOrEqual(63);
    expect(schemaTargetDatabaseName(longName)).toBe(schemaTargetDatabaseName(longName));
    expect(schemaTargetDatabaseMarker(longName)).not.toBe(schemaTargetDatabaseMarker("hall"));

    const utf8Name = "é".repeat(31);
    expect(Buffer.byteLength(utf8Name, "utf8")).toBeLessThanOrEqual(63);
    expect(Buffer.byteLength(schemaTargetDatabaseName(utf8Name), "utf8")).toBeLessThanOrEqual(63);
  });

  it("refuses to reuse a database without the exact marker and owner", () => {
    expect(() =>
      assertSchemaTargetDatabaseState("hall_target", "hall-schema-target:v1:hall", {
        marker: "hall-schema-target:v1:hall",
        owner: "hall",
        current_user: "hall",
      }),
    ).not.toThrow();
    expect(() =>
      assertSchemaTargetDatabaseState("hall_target", "hall-schema-target:v1:hall", {
        marker: null,
        owner: "hall",
        current_user: "hall",
      }),
    ).toThrow("unowned or unmarked");
    expect(() =>
      assertSchemaTargetDatabaseState("hall_target", "hall-schema-target:v1:hall", {
        marker: "hall-schema-target:v1:hall",
        owner: "another_role",
        current_user: "hall",
      }),
    ).toThrow("unowned or unmarked");
  });
});
