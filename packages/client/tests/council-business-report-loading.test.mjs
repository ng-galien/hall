// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { test, vi } from "vitest";
import { CouncilBusinessWorkbench } from "../src/pages/workspace/CouncilBusinessWorkbench.tsx";
import { useCouncilBusinessStore } from "../src/stores/councilBusinessStore.ts";

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
vi.mock("../src/components/ui/button", () => ({
  Button: ({ children, ...props }) => h("button", { type: "button", ...props }, children),
}));
vi.mock("../src/components/ui/tooltip", () => ({
  Tooltip: ({ children }) => children,
  TooltipTrigger: ({ children }) => children,
  TooltipContent: () => null,
}));
vi.mock("../src/components/ui/explorer-tree", () => ({ ExplorerTree: ({ children }) => h("div", {}, children) }));
vi.mock("../src/components/Ui", () => ({ RequestErrorBanner: ({ error }) => h("p", { role: "alert" }, error) }));
vi.mock("../src/hooks/useReferenceMentionables", () => ({
  useReferenceMentionables: () => [],
  ReferenceBusinessContext: { Provider: ({ children }) => children },
}));
vi.mock("../src/features/documents/useWorkspaceResourceImageUpload", () => ({
  useWorkspaceResourceImageUpload: () => ({ canUpload: false }),
}));
vi.mock("../src/features/documents/useEditorDocumentUpload", () => ({ useEditorDocumentUpload: () => undefined }));
vi.mock("../src/hooks/useSubmitting", () => ({ useSubmitting: () => ({ submitting: false, run: vi.fn() }) }));
vi.mock("../src/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (key) => key, formatDate: String }) }));
vi.mock("../src/features/resources/resourceCapabilities", () => ({ resourceCapabilities: () => ({}) }));
vi.mock("../src/stores/councilBusinessStore", () => {
  const state = {
    preparedSubjects: [],
    capabilitiesById: { business: {} },
    resourceItemsLoadedById: {},
    resourceItemsErrorById: {},
    loadResources: vi.fn(),
    loadPreparedSubjects: vi.fn(),
  };
  return { useCouncilBusinessStore: Object.assign((select) => select(state), { getState: () => state }) };
});

// @verifies-requirement HALL-FR-WSP-370
test("failed document loading shows a retry instead of an endless loading state", async () => {
  const store = useCouncilBusinessStore.getState();
  store.resourceItemsLoadedById = {};
  store.resourceItemsErrorById = { business: "request_failed" };
  store.loadResources.mockClear();
  const host = document.createElement("div");
  const root = createRoot(host);
  const business = {
    id: "business",
    title: "Affaire",
    reportResourceId: "report",
    folderResourceId: "folder",
    folderPath: "path",
    resources: [],
  };
  const reportSession = {
    resource: null,
    detailsFailed: false,
    actionError: null,
    editable: false,
    content: "",
    reload: vi.fn(),
  };
  const render = async () =>
    act(async () => root.render(h(CouncilBusinessWorkbench, { business, reportSession, onCreate: vi.fn() })));
  try {
    await render();
    await act(async () => host.querySelector('[data-testid="business-category-documents-toggle"]').click());
    assert.equal(
      host.querySelector('[data-testid="business-documents-load-error"] [role="alert"]')?.textContent,
      "request_failed",
    );
    assert.equal(host.querySelector('[data-testid="business-category-documents-count"]'), null);
    await act(async () => host.querySelector('[data-testid="business-documents-retry"]').click());
    assert.deepEqual(store.loadResources.mock.calls.at(-1), ["business"]);
    store.resourceItemsErrorById = {};
    store.resourceItemsLoadedById = { business: true };
    await render();
    assert.equal(host.querySelector('[data-testid="business-category-documents-count"]')?.textContent, "0");
    assert.equal(host.querySelector('[data-testid="business-documents-load-error"]'), null);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
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
vi.mock("../src/components/editor/MarkdownEditor", () => ({
  MarkdownEditor: ({ markdown }) => h("div", { "data-testid": "markdown-editor-instance" }, markdown),
}));
vi.mock("../src/components/MarkdownView", () => ({ MarkdownView: ({ markdown }) => h("div", {}, markdown) }));
vi.mock("../src/features/documents/ResourcePreview", () => ({ ResourcePreview: () => null }));
vi.mock("../src/features/documents/PdfPreviewButton", () => ({
  PdfPreviewButton: () => null,
  usePdfPreview: () => ({ referencesDocuments: false, status: "idle", openPreview: () => undefined, view: null }),
}));
vi.mock("../src/pages/workspace/AttachmentPicker", () => ({ AttachmentPicker: () => null }));
vi.mock("../src/pages/workspace/CouncilBusinessSubjects", () => ({ CouncilBusinessSubjects: () => null }));
vi.mock("../src/pages/workspace/BusinessDocumentTree", () => ({ BusinessDocumentTree: () => null }));

// @verifies-requirement HALL-FR-WSP-370
test("report shows real initial loading, then content or empty state, and keeps its editor during save", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const business = {
    id: "business",
    title: "Affaire",
    reportResourceId: "report",
    folderResourceId: "folder",
    folderPath: "path",
    resources: [],
  };
  const session = {
    resource: null,
    detailsFailed: false,
    actionError: null,
    editable: false,
    content: "",
    autosaveEnabled: true,
    dirty: false,
    submitting: false,
    reload: vi.fn(),
  };
  const render = async () =>
    act(async () => root.render(h(CouncilBusinessWorkbench, { business, reportSession: session, onCreate: vi.fn() })));
  try {
    await render();
    assert.equal(host.querySelector('[data-testid="business-report-loading"]')?.getAttribute("role"), "status");
    assert.match(host.querySelector('[data-testid="business-report-loading"]').textContent, /common.loading/);
    assert.equal(host.querySelector('[data-testid="business-report-editor"]'), null);

    session.resource = { id: "report" };
    session.editable = true;
    session.content = "Rapport prêt";
    await render();
    const editor = host.querySelector('[data-testid="markdown-editor-instance"]');
    assert.equal(editor?.textContent, "Rapport prêt");
    assert.equal(host.querySelector('[data-testid="business-report-loading"]'), null);

    session.submitting = true;
    session.dirty = true;
    session.content = "Rapport retouché";
    await render();
    assert.equal(host.querySelector('[data-testid="markdown-editor-instance"]'), editor);
    assert.equal(editor.textContent, "Rapport retouché");
    assert.equal(host.querySelector('[data-testid="business-report-loading"]'), null);

    session.editable = false;
    session.content = "";
    await render();
    assert.match(host.querySelector('[data-testid="business-report-readonly"]').textContent, /meeting.itemReportEmpty/);
    assert.equal(host.querySelector('[data-testid="business-report-loading"]'), null);

    session.resource = null;
    session.detailsFailed = true;
    session.actionError = "request_failed";
    await render();
    assert.equal(host.querySelector('[data-testid="business-report-loading"]'), null);
    assert.equal(
      host.querySelector('[data-testid="business-report-load-error"] [role="alert"]').textContent,
      "request_failed",
    );
    await act(async () => host.querySelector('[data-testid="business-report-retry"]').click());
    assert.equal(session.reload.mock.calls.length, 1);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
