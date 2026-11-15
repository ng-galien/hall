// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, test, vi } from "vitest";

const phone = vi.hoisted(() => ({ value: false }));

vi.mock("../src/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (key) => key, formatDate: String }) }));
vi.mock("../src/shell/usePhoneLayout", () => ({ usePhoneLayout: () => phone.value }));
vi.mock("../src/stores/councilBusinessStore", () => ({
  useCouncilBusinessStore: () => ({
    businesses: [],
    preparedSubjects: [],
    capabilitiesById: {},
    loadResources: vi.fn(async () => undefined),
  }),
}));
vi.mock("../src/stores/workspaceResourcesStore", () => ({
  folderCapabilitiesAt: () => ({}),
  useWorkspaceResourcesStore: () => ({
    catalog: [
      { id: "f10", kind: "folder", path: "Voirie", name: "Tranche 10", fullPath: "Voirie/Tranche 10" },
      { id: "f2", kind: "folder", path: "Voirie", name: "tranche 2", fullPath: "Voirie/tranche 2" },
      { id: "fa", kind: "folder", path: "Voirie", name: "Archives", fullPath: "Voirie/Archives" },
    ],
    summaries: {},
    representations: {},
    loadedPaths: ["Voirie"],
    loadingPaths: [],
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

const folder = "Voirie";
const document = (id, name) => ({
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
const business = (id, title, createdAt) => ({
  id,
  title,
  folderPath: folder,
  folderResourceId: `folder-${id}`,
  reportResourceId: null,
  createdAt,
  updatedAt: createdAt,
  resources: [],
});

const documents = [
  document("d-rapport", "Rapport"),
  document("d-point10", "Point 10"),
  document("d-avis", "Avis du garde champêtre"),
  document("d-point2", "point 2"),
  document("d-ecole", "École"),
];
const businesses = [
  business("b-reseau", "Réseau d'eau", "2026-01-01T00:00:00.000Z"),
  business("b-eclairage", "Éclairage public", "2026-02-01T00:00:00.000Z"),
  business("b-chemin", "Chemin du Mont Noir", "2026-03-01T00:00:00.000Z"),
];

const expectedOrder = [
  "folder:Voirie/Archives",
  "folder:Voirie/tranche 2",
  "folder:Voirie/Tranche 10",
  "workspace-business-b-chemin",
  "workspace-business-b-eclairage",
  "workspace-business-b-reseau",
  "workspace-resource-d-avis",
  "workspace-resource-d-ecole",
  "workspace-resource-d-point2",
  "workspace-resource-d-point10",
  "workspace-resource-d-rapport",
];

let host;
let root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = globalThis.document.createElement("div");
  globalThis.document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  phone.value = false;
});

const render = (arrivedBusinesses, arrivedDocuments) =>
  act(async () =>
    root.render(
      h(PathContents, {
        path: folder,
        businesses: arrivedBusinesses,
        resources: arrivedDocuments,
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

const rows = () =>
  [...host.querySelectorAll("li")]
    .filter((row) => {
      if (row.classList.contains("path-contents-root")) return false;
      const outer = row.parentElement?.closest("li");
      return !outer || outer.classList.contains("path-contents-root");
    })
    .map((row) =>
      row.classList.contains("path-contents-folder")
        ? `folder:${row.querySelector("[data-workspace-folder-path]")?.getAttribute("data-workspace-folder-path")}`
        : row.getAttribute("data-testid"),
    )
    .filter(Boolean);

// @verifies-requirement HALL-FR-WSP-500
test("a folder shows its sub-folders, then its affaires, then its documents, each by name, whatever their arrival order", async () => {
  for (const isPhone of [false, true]) {
    phone.value = isPhone;
    for (const [arrivedBusinesses, arrivedDocuments] of [
      [businesses, documents],
      [[...businesses].reverse(), [...documents].reverse()],
      [
        [businesses[1], businesses[0], businesses[2]],
        [documents[2], documents[4], documents[0], documents[3], documents[1]],
      ],
    ]) {
      await render(arrivedBusinesses, arrivedDocuments);
      assert.deepEqual(rows(), expectedOrder, isPhone ? "phone" : "computer");
    }
  }
});

// @verifies-requirement HALL-FR-WSP-500
test("a document that arrives again after being opened keeps its place, and a renamed one takes the place of its new name", async () => {
  await render(businesses, documents);
  const reopened = [...documents.filter((entry) => entry.id !== "d-point10"), documents[1]];
  await render(businesses, reopened);
  assert.deepEqual(rows(), expectedOrder);
  const renamed = [...documents.filter((entry) => entry.id !== "d-rapport"), document("d-rapport", "Annexe")];
  await render(businesses, renamed);
  assert.deepEqual(rows().slice(6, 8), ["workspace-resource-d-rapport", "workspace-resource-d-avis"]);
});
