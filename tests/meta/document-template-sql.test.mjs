import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { documentTemplateSql } from "../../scripts/distribution/document-template-sql.mjs";

// @verifies-requirement HALL-FR-ATT-170
// @verifies-requirement HALL-FR-ATT-180
describe("SQL of the default document templates", () => {
  it("matches the current defaults in migration 005 and in the 1.0.4 replacement script", async () => {
    for (const [path, content] of Object.entries(await documentTemplateSql()))
      expect(readFileSync(path, "utf8"), `${path}: run node scripts/distribution/document-template-sql.mjs`).toBe(
        content,
      );
  }, 60_000);
});
