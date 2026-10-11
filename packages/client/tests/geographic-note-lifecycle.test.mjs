// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { test, vi } from "vitest";
import {
  useAutomaticGeographicNote,
  useGeographicFeatureNote,
} from "../src/features/geographic/useGeographicFeatureCard.ts";

vi.mock("../src/features/geographic/geographicLayersApi.ts", () => ({
  canCreateGeographicFeatureNote: () => true,
  readGeographicFeatureNotes: vi.fn(),
  createGeographicFeatureNote: vi.fn(),
}));

import {
  createGeographicFeatureNote,
  readGeographicFeatureNotes,
} from "../src/features/geographic/geographicLayersApi.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// @verifies-requirement HALL-FR-DOC-390
// @verifies-requirement HALL-FR-DOC-430
test("automatic notes never write for a reader and attempt only once despite offline failures and callback rerenders", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  let calls = 0;
  function Card({ ready }) {
    useAutomaticGeographicNote(ready, () => {
      calls++;
      return Promise.resolve(false);
    });
    return null;
  }
  try {
    await act(async () => root.render(createElement(Card, { ready: false })));
    assert.equal(calls, 0);
    await act(async () => root.render(createElement(Card, { ready: true })));
    assert.equal(calls, 1);
    for (let n = 0; n < 3; n++) await act(async () => root.render(createElement(Card, { ready: true })));
    assert.equal(calls, 1);
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
    await act(async () => state.create());
    assert.deepEqual(state.note, created);
    await act(async () => resolveRead([]));
    assert.deepEqual(state.note, created);
  } finally {
    await act(async () => root.unmount());
  }
});
