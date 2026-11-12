// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { test, vi } from "vitest";
import { CouncilBusinessWorkbench } from "../src/pages/workspace/CouncilBusinessWorkbench.tsx";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.stubGlobal("matchMedia", () => ({
  matches: false,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
}));
vi.mock("../src/components/icons", async (importOriginal) => ({
  ...(await importOriginal()),
  ChevronRightIcon: () => null,
  FolderIcon: () => null,
  PinIcon: () => null,
  PinnedIcon: () => null,
}));
vi.mock("../src/components/ui/button", () => ({ Button: ({ children }) => h("button", { type: "button" }, children) }));
vi.mock("../src/components/ui/tooltip", () => ({
  Tooltip: ({ children }) => children,
  TooltipTrigger: ({ children }) => children,
  TooltipContent: () => null,
}));
vi.mock("../src/components/ui/explorer-tree", () => ({ ExplorerTree: ({ children }) => h("div", {}, children) }));
vi.mock("../src/hooks/useReferenceMentionables", () => ({
  useReferenceMentionables: () => [],
  ReferenceBusinessContext: { Provider: ({ children }) => children },
}));
vi.mock("../src/features/documents/useWorkspaceResourceImageUpload", () => ({
  useWorkspaceResourceImageUpload: () => ({ canUpload: false }),
}));
vi.mock("../src/features/documents/useEditorDocumentUpload", () => ({ useEditorDocumentUpload: () => undefined }));
vi.mock("../src/hooks/useSubmitting", () => ({ useSubmitting: () => ({ submitting: false }) }));
vi.mock("../src/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (key) => key, formatDate: String }) }));
vi.mock("../src/features/resources/resourceCapabilities", () => ({ resourceCapabilities: () => ({}) }));
vi.mock("../src/stores/councilBusinessStore", () => {
  const state = {
    preparedSubjects: [],
    capabilitiesById: { first: {}, second: {} },
    resourceItemsLoadedById: { first: true, second: true },
    loadResources: vi.fn(),
    loadPreparedSubjects: vi.fn(),
  };
  return { useCouncilBusinessStore: Object.assign((select) => select(state), { getState: () => state }) };
});
vi.mock("../src/stores/councilDecisionsStore", () => ({
  useCouncilDecisionsStore: { getState: () => ({ load: vi.fn() }) },
}));
vi.mock("../src/stores/workspaceCouncilActivityStore", () => ({
  useWorkspaceCouncilActivityStore: (select) => select({ load: vi.fn() }),
}));
vi.mock("../src/stores/workspaceResourcesStore", () => ({
  useWorkspaceResourcesStore: (select) => select({ representations: {} }),
}));
vi.mock("../src/pages/workspace/workspacePrefs", () => ({ useWorkspacePrefsStore: () => ({ isPinned: () => false }) }));
vi.mock("../src/pages/workspace/WorkspaceWorkbenchHeader", () => ({ WorkspaceWorkbenchHeader: () => null }));
vi.mock("../src/features/council-business/CouncilBusinessCommittees", () => ({
  CouncilBusinessCommittees: () => null,
}));
vi.mock("../src/features/council-business/CouncilBusinessGlyph", () => ({ CouncilBusinessGlyph: () => null }));
vi.mock("../src/components/editor/MarkdownEditor", () => ({ MarkdownEditor: () => null }));
vi.mock("../src/components/MarkdownView", () => ({ MarkdownView: () => null }));
vi.mock("../src/features/documents/ResourcePreview", () => ({ ResourcePreview: () => null }));
vi.mock("../src/features/documents/PdfPreviewButton", () => ({
  PdfPreviewButton: () => null,
  usePdfPreview: () => ({ referencesDocuments: false, status: "idle", openPreview: () => undefined, view: null }),
  usePdfCommands: () => ({ commands: [], view: null }),
}));
vi.mock("../src/pages/workspace/AttachmentPicker", () => ({ AttachmentPicker: () => null }));
vi.mock("../src/pages/workspace/CouncilBusinessSubjects", () => ({ CouncilBusinessSubjects: () => null }));
vi.mock("../src/pages/workspace/BusinessDocumentTree", () => ({
  BusinessDocumentTree: () =>
    h("details", { "data-testid": "document-descendant" }, h("summary", {}, "Document"), "Document content"),
}));

// @verifies-requirement HALL-FR-WSP-370
test("documents start folded, retain manual expansion on refresh, and fold on each affair opening", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const business = { id: "first", title: "First", resources: [{ id: "document" }], folderPath: "folder" };
  const render = async (next) =>
    act(async () =>
      root.render(
        h(CouncilBusinessWorkbench, {
          business: next,
          reportSession: { editable: false, resource: null },
          onCreate: vi.fn(),
        }),
      ),
    );
  const toggle = () => host.querySelector('[data-testid="business-category-documents-toggle"]');
  const content = () => document.getElementById(toggle().getAttribute("aria-controls"));
  try {
    await render(business);
    assert.equal(toggle().getAttribute("aria-expanded"), "false");
    assert.equal(content().hidden, true);
    await act(async () => toggle().click());
    assert.equal(toggle().getAttribute("aria-expanded"), "true");
    assert.equal(content().hidden, false);
    const descendant = host.querySelector('[data-testid="document-descendant"]');
    descendant.open = true;
    await render({ ...business, updatedAt: "2026-10-11", resources: [...business.resources] });
    assert.equal(toggle().getAttribute("aria-expanded"), "true");
    assert.equal(content().hidden, false);
    assert.equal(descendant.open, true);
    await render({ ...business, id: "second" });
    assert.equal(toggle().getAttribute("aria-expanded"), "false");
    assert.equal(content().hidden, true);
    await render(business);
    assert.equal(toggle().getAttribute("aria-expanded"), "false");
    assert.equal(content().hidden, true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
