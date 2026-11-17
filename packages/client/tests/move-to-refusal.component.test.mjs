// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { test, vi } from "vitest";

vi.mock("../src/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (key) => key }) }));
vi.mock("../src/shell/usePhoneLayout", () => ({ usePhoneLayout: () => false }));
vi.mock("../src/shell/WorkspaceTree", () => ({
  useFolderTree: () => [{ path: "Voirie", name: "Voirie", children: [], business: null, color: null }],
}));
vi.mock("../src/pages/workspace/workspaceOrg", () => ({
  moveToPath: async () => "workspace_title_conflict",
  moveIntoBusiness: async () => null,
}));

import { MoveToDialog } from "../src/pages/workspace/MoveToDialog.tsx";

// @verifies-requirement HALL-FR-WSP-090
test("a refused move is written in the foot of the window, outside its scrolling list", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(h(MoveToDialog, { item: { kind: "resource", id: "photo" }, onClose: () => undefined })),
  );
  const destination = document.querySelector('[data-testid="move-to-folder-Voirie"]');
  assert.ok(destination);
  await act(async () => destination.click());
  const error = document.querySelector('[data-testid="move-to-error"]');
  assert.ok(error, "the refusal is shown");
  assert.equal(error.textContent, "error.workspace_title_conflict");
  assert.ok(error.closest(".hall-sheet-foot"), "in the foot of the window");
  assert.equal(error.closest(".hall-sheet-body"), null, "not in the scrolling list");
  assert.equal(document.querySelectorAll('[role="alert"]').length, 1);
  await act(async () => root.unmount());
  host.remove();
});
