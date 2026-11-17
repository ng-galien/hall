// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { test, vi } from "vitest";

vi.mock("../src/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (key) => key }) }));
vi.mock("../src/shell/usePhoneLayout", () => ({ usePhoneLayout: () => true }));
vi.mock("../src/shell/headerTrail", () => ({ ScreenActions: ({ children }) => children }));

import { PhoneRenameDialog } from "../src/pages/workspace/PhoneDocumentActions.tsx";

// @verifies-requirement HALL-FR-DOC-590
test("the rename sheet of a phone writes the refusal of a name under its name field", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      h(PhoneRenameDialog, {
        open: true,
        name: "..",
        error: "resource_name_reserved",
        onClose: () => undefined,
        onRename: async () => false,
      }),
    ),
  );
  const sheet = document.querySelector('[data-testid="phone-rename-dialog"]');
  assert.ok(sheet, "the sheet is open");
  const field = sheet.querySelector('[data-testid="phone-rename-name"]');
  const alert = sheet.querySelector('[role="alert"]');
  assert.ok(alert, "the refusal is inside the sheet");
  assert.equal(alert.textContent, "error.resource_name_reserved");
  assert.ok(field.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING, "under the name field");
  await act(async () => root.unmount());
  host.remove();
});
