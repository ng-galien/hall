// @vitest-environment jsdom
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { test, vi } from "vitest";
import { ReferenceBadge, ReferencePresentationProvider } from "../src/components/editor/references.tsx";
import { TooltipProvider } from "../src/components/ui/tooltip.tsx";
import { I18nProvider } from "../src/i18n/I18nProvider.tsx";

vi.stubGlobal("localStorage", { getItem: () => "fr", setItem: () => undefined });

// @verifies-requirement HALL-FR-SRC-030
for (const kind of ["resource", "contact"]) {
  test(`${kind} reference keeps an explicit short label and falls back to the current target title`, () => {
    function render(label) {
      return renderToStaticMarkup(
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
                ReferencePresentationProvider,
                {
                  renderResourcePreview: () => null,
                  resourceAppearance: () => null,
                  referenceTarget: () => ({
                    label: "Current full title",
                    tooltip: "Target details",
                    open: { kind: "route", href: "/target" },
                  }),
                },
                h(ReferenceBadge, { kind, id: "target" }, label),
              ),
            ),
          ),
        ),
      );
    }
    const explicit = render("Short label");
    assert.match(explicit, />Short label<\/a>/);
    assert.match(explicit, /href="\/target"/);
    assert.match(explicit, new RegExp(`editor-reference-${kind}`));
    assert.doesNotMatch(explicit, /Current full title/);
    assert.match(render(""), />Current full title<\/a>/);
    assert.match(render("   "), />Current full title<\/a>/);
  });
}

// @verifies-requirement HALL-FR-SRC-030
test("a reference whose target is not loaded asks for it once, and a known one asks for nothing", async () => {
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const requests = [];
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (known) =>
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
                ReferencePresentationProvider,
                {
                  renderResourcePreview: () => null,
                  resourceAppearance: () => null,
                  referenceTarget: (_kind, id) =>
                    known.has(id) ? { label: "Courrier", tooltip: "Texte", open: { kind: "resourcePreview" } } : null,
                  requestReference: (kind, id) => requests.push(`${kind}:${id}`),
                },
                h(ReferenceBadge, { kind: "resource", id: "unknown" }, "courrier"),
                h(ReferenceBadge, { kind: "resource", id: "known" }, "arrêté"),
              ),
            ),
          ),
        ),
      ),
    );
  await render(new Set(["known"]));
  assert.deepEqual(requests, ["resource:unknown"]);
  await render(new Set(["known", "unknown"]));
  assert.deepEqual(requests, ["resource:unknown"], "a resolved reference asks nothing more");
  await act(async () => root.unmount());
  host.remove();
});
