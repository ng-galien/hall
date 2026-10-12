// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { test, vi } from "vitest";

const listIndex = vi.hoisted(() => vi.fn());
vi.mock("../src/services/councilBusinessApi", () => ({ listCouncilBusinessNavigationIndex: listIndex }));
vi.mock("../src/stores/councilBusinessStore", () => ({
  useCouncilBusinessStore: (select) => select({ businesses: [] }),
}));
vi.mock("../src/stores/workspaceResourcesStore", () => ({
  useWorkspaceResourcesStore: (select) => select({ catalog: [], collectionRepresentation: null }),
}));
vi.mock("../src/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (key) => key }) }));
vi.mock("../src/components/icons", () => ({
  ChevronDownIcon: () => null,
  ChevronRightIcon: () => null,
  CouncilBusinessIcon: () => null,
  FolderIcon: () => null,
}));
vi.mock("../src/pages/workspace/workspaceOrg", () => ({
  DRAG_TYPE: "",
  decodeDragPayload: () => null,
  moveToPath: vi.fn(),
}));

import { WorkspaceTree } from "../src/shell/WorkspaceTree.tsx";

// @verifies-requirement HALL-FR-WSP-370
test("sidebar renders all affair links from metadata index without global report or document requests", async () => {
  listIndex.mockResolvedValue({
    data: {
      businesses: [
        {
          id: "selected",
          folderResourceId: "folder",
          reportResourceId: "report",
          title: "Tourisme",
          folderPath: "Tourisme et loisirs",
        },
      ],
      catalog: [
        {
          id: "folder",
          kind: "folder",
          name: "Tourisme",
          path: "Tourisme et loisirs",
          fullPath: "Tourisme et loisirs/Tourisme",
          slug: "tourisme",
        },
      ],
      paths: ["Tourisme et loisirs/Tourisme"],
    },
  });
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        { initialEntries: ["/workspace?path=Tourisme+et+loisirs%2FTourisme&councilBusiness=selected"] },
        h(WorkspaceTree),
      ),
    ),
  );
  try {
    assert.equal(listIndex.mock.calls.length, 1);
    assert.equal(host.querySelector('[data-kind="councilBusiness"]')?.textContent, "Tourisme");
  } finally {
    await act(async () => root.unmount());
  }
});
