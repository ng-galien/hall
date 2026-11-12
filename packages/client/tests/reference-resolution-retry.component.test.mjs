// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { test, vi } from "vitest";

vi.mock("../src/components/Layout", () => ({ Layout: () => null }));
vi.mock("../src/features/documents/ResourcePreview", () => ({ ResourcePreview: () => null }));
vi.mock("../src/features/references/ContactReferenceDialog", () => ({ ContactReferenceDialog: () => null }));
vi.mock("../src/features/references/MemberReferenceDialog", () => ({ MemberReferenceDialog: () => null }));
vi.mock("../src/features/resources/ResourceEmbedPresentation", () => ({
  ResourceEmbedPresentation: () => null,
  loadResourceEmbedTableOptions: () => [],
}));

import { ApplicationPresentationProviders } from "../src/App.tsx";
import { ReferenceBadge } from "../src/components/editor/references.tsx";
import { TooltipProvider } from "../src/components/ui/tooltip.tsx";
import { I18nProvider } from "../src/i18n/I18nProvider.tsx";
import { useWorkspaceResourcesStore } from "../src/stores/workspaceResourcesStore.ts";

// @verifies-requirement HALL-FR-SRC-030
test("returning to a document retries a failed reference and concurrent badges share its request", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("localStorage", { getItem: () => "fr", setItem: () => undefined });
  const host = document.createElement("div");
  const root = createRoot(host);
  const original = useWorkspaceResourcesStore.getState();
  const id = "detached-resource";
  let release;
  const open = vi.fn(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  useWorkspaceResourcesStore.setState({ summaries: {}, catalog: [], open });
  const show = (visible) =>
    act(async () =>
      root.render(
        h(
          MemoryRouter,
          null,
          h(
            I18nProvider,
            null,
            h(
              TooltipProvider,
              null,
              h(
                ApplicationPresentationProviders,
                null,
                visible
                  ? [
                      h(ReferenceBadge, { key: "one", kind: "resource", id }, "Study"),
                      h(ReferenceBadge, { key: "two", kind: "resource", id }, "Study"),
                    ]
                  : null,
              ),
            ),
          ),
        ),
      ),
    );
  try {
    await show(true);
    assert.equal(open.mock.calls.length, 1, "two visible references share the in-flight GET");
    // A resolved resource reference is a link that opens its preview; an unresolved one opens nothing.
    assert.equal(host.querySelector(".editor-reference.is-openable"), null);
    await act(async () => release(null));
    await show(false);
    await show(true);
    assert.equal(open.mock.calls.length, 2, "returning after a transient failure retries the GET");
    await act(async () => {
      useWorkspaceResourcesStore.setState({
        summaries: {
          [id]: {
            id,
            kind: "text",
            name: "Study",
            autosaveEnabled: true,
          },
        },
      });
      release({ data: { id, kind: "text" } });
    });
    assert.equal(
      host.querySelectorAll(`a.editor-reference.is-openable[data-testid="editor-resource-reference-${id}"]`).length,
      2,
    );
  } finally {
    await act(async () => root.unmount());
    useWorkspaceResourcesStore.setState(original, true);
    vi.unstubAllGlobals();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});
