import assert from "node:assert/strict";
import { test } from "vitest";
import { workspaceCurrentOccurrence } from "../src/features/council-business/workspaceActivity.ts";

test("a completed later occurrence does not revive a historical adjournment", () => {
  const previous = { meeting: { phase: "closed", number: 1 }, agendaItem: { position: -3, completedAt: null } };
  const later = { meeting: { phase: "closed", number: 2 }, agendaItem: { position: 2, completedAt: "2026-09-05" } };
  assert.equal(workspaceCurrentOccurrence([previous, later]), null);
});

test("withdrawing a draft item makes the business available for scheduling again", () => {
  const withdrawn = {
    meeting: { phase: "draft", number: 3 },
    agendaItem: { position: -2, completedAt: null, adjournedAt: null },
  };
  assert.equal(workspaceCurrentOccurrence([withdrawn]), null);
});
