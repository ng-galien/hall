// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, test, vi } from "vitest";
import { ReferenceBadge, ReferencePresentationProvider } from "../src/components/editor/references.tsx";
import { TooltipProvider } from "../src/components/ui/tooltip.tsx";
import { ContactReferenceDialog } from "../src/features/references/ContactReferenceDialog.tsx";
import { I18nProvider } from "../src/i18n/I18nProvider.tsx";
import { ApiError } from "../src/services/apiClient.ts";
import { getContactSiren } from "../src/services/contactsApi.ts";

vi.mock("../src/services/contactsApi.ts", () => ({ getContactSiren: vi.fn() }));
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.stubGlobal("matchMedia", () => ({
  matches: false,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
}));
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {
      return undefined;
    }
    unobserve() {
      return undefined;
    }
    disconnect() {
      return undefined;
    }
  },
);
vi.stubGlobal("localStorage", { getItem: () => "fr", setItem: () => undefined });
let root;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

async function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  function Location() {
    return h("output", { "data-testid": "location" }, useLocation().pathname);
  }
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        { initialEntries: ["/workspace"] },
        h(
          I18nProvider,
          null,
          h(
            TooltipProvider,
            null,
            h(
              ReferencePresentationProvider,
              {
                renderResourcePreview: () => {
                  throw new Error("Contact must not use the document preview");
                },
                renderContactPreview: (id, onClose) => h(ContactReferenceDialog, { contactId: id, onClose }),
                resourceAppearance: () => null,
                referenceTarget: () => ({
                  label: "Julien Savourez",
                  tooltip: "Contact",
                  open: { kind: "contactPreview", href: "/contacts/contact-1" },
                }),
              },
              h(
                "article",
                { "data-testid": "report" },
                "Report context",
                h(ReferenceBadge, { kind: "contact", id: "contact-1" }, "Julien"),
              ),
              h(Location),
            ),
          ),
        ),
      ),
    ),
  );
  return document.querySelector('[data-testid="editor-contact-reference-contact-1"]');
}

async function click(element, options = {}) {
  let event;
  await act(async () => {
    event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...options });
    element.dispatchEvent(event);
  });
  return event;
}

// @verifies-requirement HALL-FR-SRC-030
test("contact click opens a read-only dedicated dialog and close preserves the report route and restores link focus", async () => {
  let resolveContact;
  getContactSiren.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveContact = resolve;
      }),
  );
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  const frames = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  const link = await mount();
  assert.equal(link.getAttribute("href"), "/contacts/contact-1");
  await act(async () => link.focus());
  assert.equal((await click(link)).defaultPrevented, true);
  const dialog = document.querySelector('[data-testid="contact-reference-dialog"]');
  assert.ok(dialog);
  assert.ok(dialog.querySelector('[data-testid="loading-indicator"]'));
  await act(async () =>
    resolveContact({
      data: {
        id: "contact-1",
        firstName: "Julien",
        lastName: "Savourez",
        organizationName: "Commune",
        jobTitle: null,
        email: "julien@example.test",
        mobilePhone: "+33612345678",
        personalPhone: null,
        professionalPhone: "+33123456789",
        notes: "Contact notes",
      },
    }),
  );
  assert.match(dialog.textContent, /Julien Savourez/);
  assert.match(dialog.textContent, /julien@example.test/);
  assert.equal(
    dialog.querySelector('[data-testid="contact-reference-mobilePhone"] a').getAttribute("href"),
    "tel:+33612345678",
  );
  assert.match(
    dialog.querySelector('[data-testid="contact-reference-professionalPhone"]').textContent,
    /01 23 45 67 89/,
  );
  assert.equal(dialog.querySelector('[data-testid="contact-reference-personalPhone"]'), null);
  assert.equal(dialog.querySelectorAll("input, textarea, [contenteditable]").length, 0);
  const report = document.querySelector('[data-testid="report"]');
  await click(dialog.querySelector('[data-testid="dialog-close"]'));
  await act(async () => {
    for (const callback of frames.splice(0)) callback(0);
  });
  assert.equal(document.querySelector('[data-testid="contact-reference-dialog"]'), null);
  assert.equal(document.querySelector('[data-testid="report"]'), report);
  assert.equal(document.querySelector('[data-testid="location"]').textContent, "/workspace");
  assert.equal(document.activeElement, link);
  assert.deepEqual(getContactSiren.mock.calls, [["contact-1"]]);
  vi.restoreAllMocks();
});

test("modified contact clicks keep native links and access denial is shown inside the dialog", async () => {
  getContactSiren.mockRejectedValue(new ApiError("permission_denied", 403));
  const link = await mount();
  for (const modifier of ["ctrlKey", "metaKey", "shiftKey", "altKey"]) {
    const event = await click(link, { [modifier]: true });
    assert.equal(event.defaultPrevented, false);
    assert.equal(document.querySelector('[data-testid="contact-reference-dialog"]'), null);
  }
  assert.equal(getContactSiren.mock.calls.length, 0);
  await click(link);
  const dialog = document.querySelector('[data-testid="contact-reference-dialog"]');
  assert.ok(dialog.querySelector('[role="alert"]'));
  assert.equal(dialog.querySelector('[data-testid="contact-reference-details"]'), null);
  assert.equal(document.querySelector('[data-testid="location"]').textContent, "/workspace");
});
