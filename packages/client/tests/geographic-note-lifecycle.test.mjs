// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { test, vi } from "vitest";
import { useGeographicFeatureNote } from "../src/features/geographic/useGeographicFeatureCard.ts";
import { useGeographicNoteDrafts } from "../src/features/geographic/useGeographicNoteDrafts.ts";

vi.mock("../src/features/geographic/geographicLayersApi.ts", () => ({
  canCreateGeographicFeatureNote: () => true,
  readGeographicFeatureNotes: vi.fn(),
  createGeographicFeatureNote: vi.fn(),
}));

vi.mock("../src/features/resources/useResourceSession.ts", () => ({ openSessionResource: vi.fn() }));
const { updateContent } = vi.hoisted(() => ({ updateContent: vi.fn() }));
vi.mock("../src/stores/workspaceResourcesStore.ts", () => ({
  useWorkspaceResourcesStore: { getState: () => ({ updateContent }), setState: vi.fn() },
}));

import {
  createGeographicFeatureNote,
  readGeographicFeatureNotes,
} from "../src/features/geographic/geographicLayersApi.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// @verifies-requirement HALL-FR-DOC-390
// @verifies-requirement HALL-FR-DOC-430
test("an empty card never writes and a first edit can be saved after a failed creation", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const create = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({
    noteId: "created",
    initialVersion: 2,
  });
  updateContent.mockResolvedValue({ kind: "text", version: 3 });
  let draft;
  function Card() {
    const draftFor = useGeographicNoteDrafts();
    draft = draftFor("layer:site", null, create);
    return null;
  }
  try {
    await act(async () => root.render(createElement(Card)));
    await act(async () => draft.change(" \n"));
    assert.equal(create.mock.calls.length, 0);
    await act(async () => draft.change("Brouillon"));
    assert.equal(draft.error, "request_failed");
    await act(async () => draft.change("Brouillon complété"));
    assert.equal(create.mock.calls.length, 1);
    assert.equal(updateContent.mock.calls.length, 0);
    await act(async () => draft.retry());
    assert.deepEqual(create.mock.calls, [
      [{ kind: "text", content: "Brouillon" }],
      [{ kind: "text", content: "Brouillon" }],
    ]);
    assert.deepEqual(updateContent.mock.calls, [
      ["created", { kind: "text", expectedVersion: 2, content: "Brouillon complété" }],
    ]);
    assert.equal(draft.readyVersion, 3);
  } finally {
    await act(async () => root.unmount());
  }
});

test("a concurrently created note is never overwritten by the first draft", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const create = vi.fn().mockResolvedValue({ noteId: "existing", initialVersion: null });
  updateContent.mockClear();
  let draft;
  function Card() {
    const draftFor = useGeographicNoteDrafts();
    draft = draftFor("layer:site", null, create);
    return null;
  }
  try {
    await act(async () => root.render(createElement(Card)));
    await act(async () => draft.change("Version locale"));
    assert.equal(draft.noteId, "existing");
    assert.equal(draft.content, "Version locale");
    assert.equal(draft.error, "conflict");
    assert.equal(updateContent.mock.calls.length, 0);
  } finally {
    await act(async () => root.unmount());
  }
});
// @verifies-requirement HALL-FR-DOC-390
test("a late empty note GET cannot erase a note created meanwhile", async () => {
  let resolveRead;
  readGeographicFeatureNotes.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
  );
  const created = { key: "site", noteId: "created" };
  createGeographicFeatureNote.mockResolvedValue(created);
  const host = document.createElement("div");
  const root = createRoot(host);
  let state;
  const layer = {};
  const feature = { layer, layerId: "layer", key: "site", featureKey: { kind: "sourceId" }, position: 0 };
  const onError = () => undefined;
  function Card() {
    state = useGeographicFeatureNote(feature, onError);
    return null;
  }
  try {
    await act(async () => root.render(createElement(Card)));
    await act(async () => state.create({ kind: "text", content: "Note" }));
    assert.deepEqual(state.note, created);
    await act(async () => resolveRead([]));
    assert.deepEqual(state.note, created);
  } finally {
    await act(async () => root.unmount());
  }
});
