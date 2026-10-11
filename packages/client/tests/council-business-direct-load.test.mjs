// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement as h, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, test, vi } from "vitest";

const api = vi.hoisted(() => ({
  listCouncilBusinesses: vi.fn(),
  listCouncilBusinessResourceItems: vi.fn(),
  openCouncilBusiness: vi.fn(),
}));
const opened = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock("../src/services/councilBusinessApi", async (importOriginal) => ({
  ...(await importOriginal()),
  ...api,
}));
vi.mock("../src/stores/workspaceResourcesStore", () => ({
  useWorkspaceResourcesStore: { getState: () => opened },
}));

import { useCouncilBusinessStore } from "../src/stores/councilBusinessStore.ts";
import { useResourceSession } from "../src/features/resources/useResourceSession.ts";

beforeEach(() => {
  vi.clearAllMocks();
  useCouncilBusinessStore.setState({ businesses: [], capabilitiesById: {}, representationsById: {}, resourceItemsLoadedById: {}, resourceItemsErrorById: {}, error: null });
});

// @verifies-requirement HALL-FR-WSP-370
test("selected document failure is identified per business and a retry restores the exact list", async () => {
  api.openCouncilBusiness.mockResolvedValue({
    data: { id: "selected", folderResourceId: "folder", reportResourceId: "report" }, representation: null,
  });
  opened.open.mockImplementation(async (id) => id === "folder"
    ? { data: { kind: "folder", name: "Tourisme", path: "Tourisme et loisirs", createdAt: "2026-01-01", updatedAt: "2026-01-02" } }
    : { data: { kind: "text", content: "Rapport courant", updatedAt: "2026-01-03" } });
  api.listCouncilBusinessResourceItems.mockRejectedValueOnce(new Error("temporary failure"));

  await useCouncilBusinessStore.getState().loadSelected("selected");
  await vi.waitFor(() => assert.ok(useCouncilBusinessStore.getState().resourceItemsErrorById.selected));
  assert.equal(useCouncilBusinessStore.getState().resourceItemsLoadedById.selected, undefined);

  api.listCouncilBusinessResourceItems.mockResolvedValueOnce([
    { id: "document", kind: "document", councilBusinessId: "selected", position: 1 },
  ]);
  assert.equal(await useCouncilBusinessStore.getState().loadResources("selected"), true);
  assert.equal(useCouncilBusinessStore.getState().resourceItemsErrorById.selected, null);
  assert.equal(useCouncilBusinessStore.getState().resourceItemsLoadedById.selected, true);
  assert.deepEqual(useCouncilBusinessStore.getState().businesses[0].resources.map(({ id }) => id), ["document"]);
});

// @verifies-requirement HALL-FR-WSP-370
test("a direct business opens its report before its own documents and without the global business index", async () => {
  let releaseDocuments;
  const documents = new Promise((resolve) => { releaseDocuments = resolve; });
  api.openCouncilBusiness.mockResolvedValue({
    data: { id: "selected", folderResourceId: "folder", reportResourceId: "report" },
    representation: null,
  });
  api.listCouncilBusinessResourceItems.mockReturnValue(documents);
  let reportReads = 0;
  opened.open.mockImplementation(async (id) => {
    if (id === "folder") return { data: { kind: "folder", name: "Tourisme", path: "Tourisme et loisirs", createdAt: "2026-01-01", updatedAt: "2026-01-02" } };
    reportReads += 1;
    return reportReads === 1
      ? { data: { id: "report", kind: "text", name: "Rapport", path: "", tags: [], content: "Rapport courant", autosaveEnabled: true, updatedAt: "2026-01-03" }, representation: null }
      : null;
  });

  const [selected, repeated] = await Promise.all([
    useCouncilBusinessStore.getState().loadSelected("selected"),
    useCouncilBusinessStore.getState().loadSelected("selected"),
  ]);
  assert.equal(selected?.report, "", "the report session owns the one initial report read");
  assert.equal(repeated, selected);
  assert.equal(api.openCouncilBusiness.mock.calls.length, 1);
  assert.equal(reportReads, 0);
  assert.equal(useCouncilBusinessStore.getState().businesses[0]?.id, "selected");
  assert.equal(api.listCouncilBusinesses.mock.calls.length, 0);
  assert.deepEqual(api.listCouncilBusinessResourceItems.mock.calls, [[["selected"]]]);
  assert.equal(useCouncilBusinessStore.getState().resourceItemsLoadedById.selected, undefined);

  const host = document.createElement("div");
  const root = createRoot(host);
  let session;
  function ReportSession() {
    session = useResourceSession({ resourceId: "report" });
    return null;
  }
  try {
    await act(async () => root.render(h(StrictMode, null, h(ReportSession))));
    assert.equal(session.content, "Rapport courant");
    assert.equal(session.detailsFailed, false);
    assert.equal(reportReads, 1, "a second report GET would fail and hide the successful first response");
  } finally {
    await act(async () => root.unmount());
  }

  releaseDocuments([{ id: "document", kind: "document", councilBusinessId: "selected", position: 0 }]);
  await vi.waitFor(() => assert.equal(useCouncilBusinessStore.getState().resourceItemsLoadedById.selected, true));
  assert.deepEqual(useCouncilBusinessStore.getState().businesses[0].resources.map(({ id }) => id), ["document"]);
});
