// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { test, vi } from "vitest";

const calls = vi.hoisted(() => ({ resources: vi.fn(), folder: vi.fn(), hydrate: vi.fn(), activity: vi.fn() }));
vi.mock("../src/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (key) => key, formatDate: String }) }));
vi.mock("../src/stores/councilBusinessStore", () => ({
  useCouncilBusinessStore: () => ({
    businesses: [],
    preparedSubjects: [],
    capabilitiesById: {},
    loadResources: calls.resources,
  }),
}));
vi.mock("../src/stores/workspaceResourcesStore", () => ({
  useWorkspaceResourcesStore: () => ({
    catalog: [],
    summaries: {},
    loadedPaths: [],
    collectionCapabilities: {},
    loadFolder: calls.folder,
    hydrate: calls.hydrate,
  }),
}));
vi.mock("../src/stores/workspaceCouncilActivityStore", () => ({
  useWorkspaceCouncilActivityStore: () => ({ load: calls.activity }),
}));

import { PathContents } from "../src/pages/workspace/PathContents.tsx";

// @verifies-requirement HALL-FR-WSP-370
test("a hidden folder panel does not fetch other business documents or mount its rows", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () =>
    root.render(
      h(PathContents, {
        path: "Tourisme et loisirs/Tourisme",
        businesses: [
          { id: "other", title: "Other business", folderPath: "Tourisme et loisirs/Tourisme", resources: [] },
        ],
        resources: [],
        selection: { kind: "councilBusiness", id: "selected" },
        onSelect: vi.fn(),
        onCreate: vi.fn(),
        onImportFolder: vi.fn(),
        onPreview: vi.fn(),
        onImportBundle: vi.fn(),
        onExportBundle: vi.fn(),
        onDeleteBusiness: vi.fn(),
        hidden: true,
      }),
    ),
  );
  try {
    assert.equal(host.childElementCount, 0);
    for (const [name, spy] of Object.entries(calls)) assert.equal(spy.mock.calls.length, 0, name);
  } finally {
    await act(async () => root.unmount());
  }
});
