import assert from "node:assert/strict";
import test from "node:test";
import { referenceOpenTarget } from "../src/features/references/referenceNavigation.ts";

const emptyCatalog = { resources: [], businesses: [], decisions: [], meetings: [], members: [] };

test("a decision without a workspace carrier still opens the decisions screen", () => {
  const target = referenceOpenTarget("decision", "decision-1", {
    ...emptyCatalog,
    decisions: [{ id: "decision-1" }],
  });
  assert.deepEqual(target, { kind: "route", href: "/council-decisions" });
});

test("a carried decision opens its canonical workspace item", () => {
  const target = referenceOpenTarget("decision", "decision-1", {
    ...emptyCatalog,
    decisions: [{ id: "decision-1" }],
    businesses: [
      { id: "business-1", kind: "matter", councilDecisionId: "decision-1", folderPath: "finances/subventions" },
    ],
  });
  assert.deepEqual(target, {
    kind: "route",
    href: "/workspace?path=finances%2Fsubventions&councilBusiness=business-1",
  });
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
