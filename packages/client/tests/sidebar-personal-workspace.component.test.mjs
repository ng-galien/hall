// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, test, vi } from "vitest";

vi.mock("../src/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (key) => key }) }));
vi.mock("../src/shell/usePhoneLayout", () => ({ useApiRoot: () => ({ available: () => true }) }));
vi.mock("../src/shell/WorkspaceTree", () => ({
  WorkspaceTree: () => h("div", { "data-testid": "workspace-tree" }),
  useFolderTree: () => [],
}));

import { TooltipProvider } from "../src/components/ui/tooltip.tsx";
import { AppSidebar } from "../src/shell/AppSidebar.tsx";
import { useWorkspaceResourcesStore } from "../src/stores/workspaceResourcesStore.ts";

const personalPath = "Espaces personnels/Claire Martin";
let host;
let root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  useWorkspaceResourcesStore.setState({ personalWorkspacePath: null });
  vi.unstubAllGlobals();
});

/** Renders the menu at the address `entry`, in a new root since a memory router reads its entry once. */
async function renderAt(entry, { compact = false, path = personalPath } = {}) {
  useWorkspaceResourcesStore.setState({ personalWorkspacePath: path });
  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        { initialEntries: [entry] },
        h(TooltipProvider, null, h(AppSidebar, { compact, navigation: { expanded: !compact, toggle: vi.fn() } })),
      ),
    ),
  );
}

const row = (id) => host.querySelector(`[data-testid="navigation-${id}"]`);
const blockOf = (id) =>
  [...host.querySelectorAll(".app-sidebar-block")]
    .map((block) => [...block.querySelectorAll(":scope > .app-sidebar-item > a")].map((link) => link.dataset.testid))[1]
    .indexOf(`navigation-${id}`);

// @verifies-requirement HALL-FR-LAY-110
// @verifies-requirement HALL-FR-WSP-380
test("the menu opens the personal folder of the person from an entry placed before Documents", async () => {
  await renderAt("/");
  const personal = row("personal");
  assert.ok(personal, "the entry shows for a person who has a personal folder");
  assert.equal(personal.getAttribute("href"), `/workspace?${new URLSearchParams({ path: personalPath })}`);
  assert.equal(personal.textContent, "workspace.personalWorkspace");
  assert.equal(blockOf("personal") + 1, blockOf("workspace"), "it comes just before Documents");
  assert.equal(personal.getAttribute("aria-current"), null);
});

// @verifies-requirement HALL-FR-LAY-110
test("in the personal folder or one of its folders, the personal entry is current and Documents is not", async () => {
  for (const path of [personalPath, `${personalPath}/Notes`]) {
    await renderAt(`/workspace?${new URLSearchParams({ path })}`);
    assert.equal(row("personal").getAttribute("aria-current"), "page", path);
    assert.equal(row("workspace").getAttribute("aria-current"), null, path);
    assert.equal(host.querySelector('[data-testid="workspace-tree"]'), null, path);
  }
  await renderAt(`/workspace?${new URLSearchParams({ path: "Conseil" })}`);
  assert.equal(row("personal").getAttribute("aria-current"), null);
  assert.equal(row("workspace").getAttribute("aria-current"), "page");
});

// @verifies-requirement HALL-FR-LAY-110
test("the folded menu keeps the personal entry and its current state", async () => {
  await renderAt(`/workspace?${new URLSearchParams({ path: personalPath })}`, { compact: true });
  assert.equal(row("personal").getAttribute("aria-current"), "page");
  assert.equal(row("personal").getAttribute("aria-label"), "workspace.personalWorkspace");
  assert.equal(row("workspace").dataset.current, undefined);
});

// @verifies-requirement HALL-FR-LAY-110
test("a person without a personal folder has no personal entry", async () => {
  await renderAt("/", { path: null });
  assert.equal(row("personal"), null);
  assert.ok(row("workspace"));
});
