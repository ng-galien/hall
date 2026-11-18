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

function renderReference(kind, label, target = "Current full title") {
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
              referenceTarget: () =>
                target ? { label: target, tooltip: "Target details", open: { kind: "route", href: "/target" } } : null,
            },
            h(ReferenceBadge, { kind, id: "target" }, label),
          ),
        ),
      ),
    ),
  );
}

// @verifies-requirement HALL-FR-SRC-030
test("a document reference writes the current name of the document, and its stored label only when it is not found", () => {
  const renamed = renderReference("resource", "Name at insertion", "Name after rename");
  assert.match(renamed, />Name after rename<\/a>/);
  assert.match(renamed, /href="\/target"/);
  assert.match(renamed, /editor-reference-resource/);
  assert.doesNotMatch(renamed, /Name at insertion/);
  assert.match(renderReference("resource", ""), />Current full title<\/a>/);
  assert.match(renderReference("resource", "Stored label", null), /Stored label/);
});

// @verifies-requirement HALL-FR-SRC-030
test("a contact reference keeps an explicit short label and falls back to the current contact name", () => {
  const explicit = renderReference("contact", "Short label");
  assert.match(explicit, />Short label<\/a>/);
  assert.match(explicit, /href="\/target"/);
  assert.match(explicit, /editor-reference-contact/);
  assert.doesNotMatch(explicit, /Current full title/);
  assert.match(renderReference("contact", ""), />Current full title<\/a>/);
  assert.match(renderReference("contact", "   "), />Current full title<\/a>/);
});

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
