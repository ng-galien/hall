import assert from "node:assert/strict";
import test from "node:test";
import { resourceFillsExtendedView, resourceSupportsAutosave } from "../src/features/resources/resourceEditorPolicy.ts";

const cases = [
  ["text", false, true],
  ["spreadsheet", true, true],
  ["document", true, false],
  ["remote", false, true],
  ["geographic", true, true],
  ["legalReference", false, false],
];

test("each resource kind has one stable editor layout and autosave policy", () => {
  for (const [kind, fillsExtendedView, supportsAutosave] of cases) {
    const resource = { kind };
    assert.equal(resourceFillsExtendedView(resource), fillsExtendedView, kind);
    assert.equal(resourceSupportsAutosave(resource), supportsAutosave, kind);
  }
});
