// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, test, vi } from "vitest";

vi.mock("../src/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (key) => key }) }));

import { TooltipProvider } from "../src/components/ui/tooltip.tsx";
import { folderTrail } from "../src/pages/workspace/paths.ts";
import { WorkspaceBreadcrumb } from "../src/pages/workspace/WorkspaceBreadcrumb/index.ts";
import { useScreenHeading } from "../src/shell/ScreenHeader.tsx";
import { useWorkspaceResourcesStore } from "../src/stores/workspaceResourcesStore.ts";

const personalPath = "Espaces personnels/Nicolas Garnier";
const href = (path) => `/workspace?${new URLSearchParams({ path })}`;
let host;
let root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  useWorkspaceResourcesStore.setState({ personalWorkspacePath: personalPath, loadFolder: vi.fn(async () => true) });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  useWorkspaceResourcesStore.setState({ personalWorkspacePath: null });
  vi.unstubAllGlobals();
});

async function headingAt(entry) {
  let heading;
  function Probe() {
    heading = useScreenHeading();
    return null;
  }
  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () => root.render(h(MemoryRouter, { initialEntries: [entry] }, h(Probe))));
  return heading;
}

// @verifies-requirement HALL-FR-WSP-380
test("inside the personal folder, the trail goes from Documents to « Mon espace » without the folders above it", () => {
  assert.deepEqual(folderTrail(`${personalPath}/Notes/Séance 4`, personalPath), [
    { path: personalPath, name: "Nicolas Garnier", personal: true },
    { path: `${personalPath}/Notes`, name: "Notes", personal: false },
    { path: `${personalPath}/Notes/Séance 4`, name: "Séance 4", personal: false },
  ]);
  assert.deepEqual(
    folderTrail("Espaces personnels/Laure Morin", personalPath).map((step) => step.path),
    ["Espaces personnels", "Espaces personnels/Laure Morin"],
  );
  assert.deepEqual(
    folderTrail("Voirie/Chemins", null).map((step) => step.name),
    ["Voirie", "Chemins"],
  );
});

// @verifies-requirement HALL-FR-WSP-380
test("on the phone, each folder of the personal folder goes back to its parent, « Mon espace » goes back to Documents", async () => {
  assert.deepEqual(await headingAt(href(`${personalPath}/Notes/Séance 4`)), {
    title: "Séance 4",
    back: { to: href(`${personalPath}/Notes`), label: "Notes" },
  });
  assert.deepEqual(await headingAt(href(`${personalPath}/Notes`)), {
    title: "Notes",
    back: { to: href(personalPath), label: "workspace.personalWorkspace" },
  });
  assert.deepEqual(await headingAt(href(personalPath)), {
    title: "workspace.personalWorkspace",
    back: { to: "/workspace", label: "navigation.documents" },
  });
  assert.deepEqual(await headingAt(href("Voirie")), {
    title: "Voirie",
    back: { to: "/workspace", label: "navigation.documents" },
  });
});

// @verifies-requirement HALL-FR-WSP-380
test("on the computer, the trail of a personal sub-folder is Documents then « Mon espace », never « Espaces personnels »", async () => {
  const onSelect = vi.fn();
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        null,
        h(TooltipProvider, null, h(WorkspaceBreadcrumb, { path: `${personalPath}/Notes`, onSelect })),
      ),
    ),
  );
  const crumbs = [...host.querySelectorAll(".workspace-crumb")].map((crumb) => crumb.textContent);
  assert.deepEqual(crumbs, ["navigation.workspace", "workspace.personalWorkspace", "Notes"]);
  assert.ok(host.querySelector('[data-testid="workspace-breadcrumb-personal"]'));
  const personal = [...host.querySelectorAll(".workspace-crumb")][1];
  await act(async () => personal.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  assert.deepEqual(onSelect.mock.calls.at(-1), [null, personalPath]);
});
