// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, test, vi } from "vitest";
import { ReferenceBadge, ReferencePresentationProvider } from "../src/components/editor/references.tsx";
import { TooltipProvider } from "../src/components/ui/tooltip.tsx";
import { MemberReferenceDialog } from "../src/features/references/MemberReferenceDialog.tsx";
import { I18nProvider } from "../src/i18n/I18nProvider.tsx";
import { ApiError } from "../src/services/apiClient.ts";
import { getContactSiren } from "../src/services/contactsApi.ts";
import { getCouncilMemberSiren } from "../src/services/councilMembersApi.ts";

vi.mock("../src/services/contactsApi.ts", () => ({ getContactSiren: vi.fn() }));
vi.mock("../src/services/councilMembersApi.ts", () => ({ getCouncilMemberSiren: vi.fn() }));
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
  vi.restoreAllMocks();
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
                  throw new Error("Member must not use document preview");
                },
                renderContactPreview: () => {
                  throw new Error("Member must not use contact preview");
                },
                renderMemberPreview: (id, onClose) => h(MemberReferenceDialog, { memberId: id, onClose }),
                resourceAppearance: () => null,
                referenceTarget: () => ({
                  label: "Epona Arverna",
                  tooltip: "Membre du conseil",
                  open: { kind: "memberPreview", href: "/council-members/member-1" },
                }),
              },
              h(
                "article",
                { "data-testid": "report" },
                "Report context ",
                h(ReferenceBadge, { kind: "member", id: "member-1" }, "Madame la maire"),
              ),
              h(Location),
            ),
          ),
        ),
      ),
    ),
  );
  return document.querySelector('[data-testid="editor-member-reference-member-1"]');
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
test("member reference reads its real Siren role in a dialog and restores report focus on close", async () => {
  getCouncilMemberSiren.mockResolvedValue({
    data: {
      id: "member-1",
      contactId: "contact-1",
      councilTermId: "term-1",
      rank: 0,
      role: "mayor",
      active: true,
      termStartedOn: "2026-03-20",
      termEndedOn: null,
    },
  });
  getContactSiren.mockResolvedValue({
    data: {
      id: "contact-1",
      firstName: "Epona",
      lastName: "Arverna",
      organizationName: null,
      jobTitle: null,
      email: "epona@example.test",
      phone: null,
      notes: "",
    },
  });
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  const frames = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  const link = await mount();
  assert.equal(link.getAttribute("href"), "/council-members/member-1");
  assert.equal(link.textContent, "Madame la maire");
  await act(async () => link.focus());
  assert.equal((await click(link)).defaultPrevented, true);
  const dialog = document.querySelector('[data-testid="member-reference-dialog"]');
  assert.ok(dialog);
  assert.match(dialog.querySelector('[data-testid="member-reference-role"]').textContent, /Maire/);
  assert.match(dialog.querySelector('[data-testid="member-reference-email"]').textContent, /epona@example.test/);
  assert.equal(dialog.querySelectorAll("input, textarea, [contenteditable]").length, 0);
  const report = document.querySelector('[data-testid="report"]');
  await click(dialog.querySelector('[data-testid="dialog-close"]'));
  await act(async () => {
    for (const callback of frames.splice(0)) callback(0);
  });
  assert.equal(document.querySelector('[data-testid="member-reference-dialog"]'), null);
  assert.equal(document.querySelector('[data-testid="report"]'), report);
  assert.equal(document.querySelector('[data-testid="location"]').textContent, "/workspace");
  assert.equal(document.activeElement, link);
  assert.deepEqual(getCouncilMemberSiren.mock.calls, [["member-1"]]);
  assert.deepEqual(getContactSiren.mock.calls, [["contact-1"]]);
});

test("modified member click retains its page link and denied access stays inside the dialog", async () => {
  getCouncilMemberSiren.mockRejectedValue(new ApiError("permission_denied", 403));
  const link = await mount();
  for (const modifier of ["ctrlKey", "metaKey", "shiftKey", "altKey"]) {
    assert.equal((await click(link, { [modifier]: true })).defaultPrevented, false);
    assert.equal(document.querySelector('[data-testid="member-reference-dialog"]'), null);
  }
  assert.equal(getCouncilMemberSiren.mock.calls.length, 0);
  await click(link);
  const dialog = document.querySelector('[data-testid="member-reference-dialog"]');
  assert.ok(dialog.querySelector('[role="alert"]'));
  assert.equal(dialog.querySelector('[data-testid="member-reference-details"]'), null);
  assert.equal(getContactSiren.mock.calls.length, 0);
  assert.equal(document.querySelector('[data-testid="location"]').textContent, "/workspace");
});

test("missing council member is reported in the dialog without loading its contact", async () => {
  getCouncilMemberSiren.mockRejectedValue(new ApiError("council_member_not_found", 404));
  const link = await mount();
  await click(link);
  const dialog = document.querySelector('[data-testid="member-reference-dialog"]');
  assert.match(dialog.textContent, /introuvable/);
  assert.equal(dialog.querySelector('[data-testid="member-reference-details"]'), null);
  assert.equal(getContactSiren.mock.calls.length, 0);
  assert.equal(document.querySelector('[data-testid="location"]').textContent, "/workspace");
});
