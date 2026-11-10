// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { test, vi } from "vitest";

vi.mock("../src/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (key) => key, formatDate: String }) }));
vi.mock("../src/stores/councilBusinessStore", () => ({
  useCouncilBusinessStore: () => ({
    businesses: [{ id: "commissions", title: "Commissions", folderPath: "Conseil", resources: [] }],
    preparedSubjects: [
      { id: "subject", kind: "openQuestion", councilBusinessId: "commissions", textResourceId: "text" },
    ],
    capabilitiesById: { commissions: {} },
    loadResources: vi.fn(),
  }),
}));
vi.mock("../src/stores/workspaceResourcesStore", () => ({
  folderCapabilitiesAt: () => ({}),
  useWorkspaceResourcesStore: () => ({
    catalog: [{ id: "folder", kind: "folder", path: "Conseil", name: "Commissions", fullPath: "Conseil/Commissions" }],
    summaries: {},
    representations: {},
    loadedPaths: [],
    collectionCapabilities: {},
    loadFolder: vi.fn(),
    hydrate: vi.fn(),
  }),
}));
vi.mock("../src/stores/workspaceCouncilActivityStore", () => ({
  useWorkspaceCouncilActivityStore: () => ({ load: vi.fn() }),
}));

import { PathContents } from "../src/pages/workspace/PathContents.tsx";

vi.stubGlobal("matchMedia", () => ({
  matches: false,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
}));

const folder = "Conseil/Commissions";
const file = (id, name) => ({
  id,
  slug: id,
  kind: "text",
  path: folder,
  name,
  fullPath: `${folder}/${name}`,
  updatedAt: "2026-11-05T00:00:00.000Z",
  createdAt: "2026-11-05T00:00:00.000Z",
  tags: [],
  state: { readiness: "ready" },
});

test("the tree lists every file of a business folder: report, attachments, subject texts and loose files", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const resources = [
    file("report", "Présentation"),
    file("attachment", "Composition de la CCID"),
    file("text", "Désignation du référent déontologue"),
    file("loose", "Désignation des membres de la CCLE"),
  ];
  await act(async () =>
    root.render(
      h(PathContents, {
        path: "",
        businesses: [
          {
            id: "commissions",
            title: "Commissions",
            folderPath: "Conseil",
            folderResourceId: "folder",
            reportResourceId: "report",
            updatedAt: "2026-11-05T00:00:00.000Z",
            resources: [resources[1]],
          },
        ],
        resources,
        selection: null,
        onSelect: vi.fn(),
        onCreate: vi.fn(),
        onImportFolder: vi.fn(),
        onPreview: vi.fn(),
        onImportBundle: vi.fn(),
        onExportBundle: vi.fn(),
        onDeleteBusiness: vi.fn(),
      }),
    ),
  );
  try {
    for (const folderPath of ["Conseil", folder]) {
      const toggle = host.querySelector(`[data-testid="workspace-folder-${folderPath}"]`);
      assert.ok(toggle, folderPath);
      await act(async () => toggle.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })));
    }
    for (const resource of resources)
      assert.ok(host.querySelector(`[data-testid="workspace-resource-${resource.id}"]`), resource.name);
  } finally {
    await act(async () => root.unmount());
  }
});
