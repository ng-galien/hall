// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { test, vi } from "vitest";

const calls = vi.hoisted(() => ({
  contacts: vi.fn(),
  members: vi.fn(),
  committees: vi.fn(),
  meetings: vi.fn(),
  businesses: vi.fn(),
  decisions: vi.fn(),
  activity: vi.fn(),
  finish: vi.fn(),
}));
vi.mock("../src/stores/contactsStore", () => ({ useContactsStore: { getState: () => ({ load: calls.contacts }) } }));
vi.mock("../src/stores/councilMembersStore", () => ({
  useCouncilMembersStore: { getState: () => ({ load: calls.members }) },
}));
vi.mock("../src/stores/councilCommitteesStore", () => ({
  useCouncilCommitteesStore: { getState: () => ({ load: calls.committees }) },
}));
vi.mock("../src/stores/councilMeetingsStore", () => ({
  useCouncilMeetingsStore: { getState: () => ({ load: calls.meetings }) },
}));
vi.mock("../src/stores/councilBusinessStore", () => ({
  useCouncilBusinessStore: { getState: () => ({ load: calls.businesses }) },
}));
vi.mock("../src/stores/councilDecisionsStore", () => ({
  useCouncilDecisionsStore: { getState: () => ({ load: calls.decisions }) },
}));
vi.mock("../src/stores/workspaceCouncilActivityStore", () => ({
  useWorkspaceCouncilActivityStore: { getState: () => ({ load: calls.activity }) },
}));
vi.mock("../src/stores/applicationSyncStore", () => ({
  useApplicationSyncStore: { getState: () => ({ finish: calls.finish }) },
}));

import { useApplicationData } from "../src/hooks/useApplicationData.ts";

function Bootstrap() {
  useApplicationData();
  return null;
}

// @verifies-requirement HALL-FR-WSP-370
test("cold direct business navigation does not bootstrap unrelated global stores", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () =>
    root.render(
      h(MemoryRouter, { initialEntries: ["/workspace?path=Tourisme&councilBusiness=selected"] }, h(Bootstrap)),
    ),
  );
  try {
    for (const [name, spy] of Object.entries(calls)) {
      if (name !== "finish") assert.equal(spy.mock.calls.length, 0, name);
    }
    assert.equal(calls.finish.mock.calls.length, 1);
  } finally {
    await act(async () => root.unmount());
  }
});
