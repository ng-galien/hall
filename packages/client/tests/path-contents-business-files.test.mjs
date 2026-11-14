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

// @verifies-requirement HALL-FR-WSP-490
test("the unfolded business row lists every file of its folder: report, attachments, subject texts and loose files", async () => {
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
    // A folder and a business unfold by their icon; their row opens them.
    for (const testId of ["workspace-folder-expand-Conseil", "workspace-business-expand-commissions"]) {
      const toggle = host.querySelector(`[data-testid="${testId}"]`);
      assert.ok(toggle, testId);
      await act(async () => toggle.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })));
    }
    assert.equal(host.querySelector(`[data-testid="workspace-folder-${folder}"]`), null);
    assert.equal(host.querySelectorAll('[data-testid="workspace-business-commissions"]').length, 1);
    for (const resource of resources)
      assert.ok(host.querySelector(`[data-testid="workspace-resource-${resource.id}"]`), resource.name);
  } finally {
    await act(async () => root.unmount());
  }
});

// @verifies-requirement HALL-FR-WSP-490
test("the arrow keys unfold and fold a business row as they do a folder row", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const resources = [file("report", "Présentation"), file("loose", "Désignation des membres de la CCLE")];
  await act(async () =>
    root.render(
      h(PathContents, {
        path: "Conseil",
        businesses: [
          {
            id: "commissions",
            title: "Commissions",
            folderPath: "Conseil",
            folderResourceId: "folder",
            reportResourceId: "report",
            updatedAt: "2026-11-05T00:00:00.000Z",
            resources: [],
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
  const press = async (target, key) =>
    act(async () => target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
  const businessNode = () => host.querySelector('[data-testid="workspace-business-title-commissions"]');
  const expand = () => host.querySelector('[data-testid="workspace-business-expand-commissions"]');
  try {
    assert.equal(expand().getAttribute("aria-expanded"), "false");
    await press(businessNode(), "ArrowRight");
    assert.equal(expand().getAttribute("aria-expanded"), "true");
    assert.ok(host.querySelector('[data-testid="workspace-resource-loose"]'));
    await press(businessNode(), "ArrowRight");
    const firstChild = host.querySelector(
      '[data-testid="workspace-business-commissions"] .list-row-children button[data-workspace-tree-node]',
    );
    assert.equal(document.activeElement, firstChild);
    await press(firstChild, "ArrowLeft");
    assert.equal(expand().getAttribute("aria-expanded"), "false");
    assert.equal(document.activeElement, businessNode());
    assert.equal(host.querySelector('[data-testid="workspace-resource-loose"]'), null);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
