// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, test, vi } from "vitest";
import { TooltipProvider } from "../src/components/ui/tooltip.tsx";
import { AgendaItemRecusalDialog } from "../src/features/council-meetings/AgendaItemRecusalDialog.tsx";
import { I18nProvider } from "../src/i18n/I18nProvider.tsx";

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

const member = (id, firstName, lastName) => ({ id, role: "councillor", contact: { firstName, lastName } });
const members = [member("member-1", "Claire", "Morel"), member("member-2", "Paul", "Girard")];

async function click(element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  });
}

const byTestId = (testId) => document.querySelector(`[data-testid="${testId}"]`);

async function mountRecusalDialog(controller, onClose) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      h(
        I18nProvider,
        null,
        h(
          TooltipProvider,
          null,
          h(AgendaItemRecusalDialog, {
            controller,
            members,
            pointLabel: "3. Vente de la parcelle AB 12",
            initialMemberId: "member-2",
            onClose,
          }),
        ),
      ),
    ),
  );
}

// @verifies-requirement HALL-FR-AGI-440
test("a recusal is recorded only after a confirmation naming the member, the item and the basis", async () => {
  const record = vi.fn(async () => true);
  const onClose = vi.fn();
  await mountRecusalDialog(
    { state: { recusals: [] }, canRecord: true, error: null, submitting: false, record },
    onClose,
  );
  await click(byTestId("recusal-basis-personalInterest"));
  await click(byTestId("recusal-submit"));
  assert.equal(record.mock.calls.length, 0);
  const confirmation = byTestId("recusal-confirm-dialog");
  assert.ok(confirmation);
  assert.match(confirmation.textContent, /Paul Girard/);
  assert.match(confirmation.textContent, /3\. Vente de la parcelle AB 12/);
  assert.match(confirmation.textContent, /Intérêt personnel/);
  assert.match(confirmation.textContent, /tant qu’aucun résultat de scrutin n’est enregistré/);

  await click(byTestId("recusal-confirm-cancel"));
  assert.equal(record.mock.calls.length, 0);
  assert.ok(byTestId("recusal-form"));

  await click(byTestId("recusal-submit"));
  await click(byTestId("recusal-confirm"));
  assert.deepEqual(record.mock.calls, [[{ councilMemberId: "member-2", legalBasis: "personalInterest" }]]);
  assert.equal(onClose.mock.calls.length, 1);
});
