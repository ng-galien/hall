import assert from "node:assert/strict";
import { test } from "vitest";
import { referenceOpenTarget } from "../src/features/references/referenceNavigation.ts";

const emptyCatalog = { resources: [], businesses: [], decisions: [], meetings: [], members: [], contacts: [] };

test("a documentary decision opens its own detail independently of the workspace", () => {
  const target = referenceOpenTarget("decision", "decision-1", {
    ...emptyCatalog,
    decisions: [{ id: "decision-1" }],
  });
  assert.deepEqual(target, { kind: "route", href: "/council-decisions/decision-1" });
});

test("a resource uses the common in-place preview", () => {
  const target = referenceOpenTarget("resource", "resource-1", {
    ...emptyCatalog,
    resources: [{ id: "resource-1" }],
  });
  assert.deepEqual(target, { kind: "resourcePreview", resourceId: "resource-1" });
});

test("a missing reference has no invented navigation", () => {
  assert.equal(referenceOpenTarget("member", "missing", emptyCatalog), null);
});
