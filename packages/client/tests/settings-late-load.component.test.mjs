// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement as h, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { test, vi } from "vitest";

const pendingLoads = [];

vi.mock("../src/services/hallSettingsApi", () => ({
  loadHallSettings: () =>
    new Promise((resolve) => {
      pendingLoads.push(resolve);
    }),
  updateActiveCouncilTermExpectedMemberCount: vi.fn(),
}));
vi.mock("../src/services/apiClient", () => ({
  apiSirenRequest: () => Promise.resolve({ data: null, representation: null }),
  apiErrorCode: () => "unknown",
}));
vi.mock("../src/services/authApi", () => ({
  getSessionSiren: () => Promise.resolve({ data: null, representation: null }),
  changePassword: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("../src/features/settings/CommuneSettings", () => ({ CommuneSettings: () => null }));
vi.mock("../src/features/settings/MailSettings", () => ({ MailSettings: () => null }));
vi.mock("../src/features/council-meetings/MeetingLocationsSettings", () => ({ MeetingLocationsSettings: () => null }));
vi.mock("../src/features/authorization/AuthorizationSettings", () => ({ AuthorizationSettings: () => null }));
vi.mock("../src/features/users/PasswordDialog", () => ({ PasswordDialog: () => null }));
vi.mock("../src/pages/TemplatesPage", () => ({ TemplatesPage: () => null }));

import { TooltipProvider } from "../src/components/ui/tooltip.tsx";
import { I18nProvider } from "../src/i18n/I18nProvider.tsx";
import { SettingsPage } from "../src/pages/SettingsPage.tsx";

const loaded = {
  settings: { meetingLocations: [] },
  canUpdate: true,
  councilTerm: { expectedMemberCount: 15 },
  canConfigureCouncilTerm: true,
};

function type(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, value);
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
}

// @verifies-requirement HALL-FR-CFG-010
test("a settings load answered after the person typed does not replace the expected member count", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("localStorage", { getItem: () => "fr", setItem: () => undefined });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const field = () => host.querySelector('[data-testid="settings-expected-member-count"]');
  try {
    await act(async () =>
      root.render(
        h(
          StrictMode,
          null,
          h(
            MemoryRouter,
            null,
            h(I18nProvider, null, h(TooltipProvider, null, h(SettingsPage, { category: "commune" }))),
          ),
        ),
      ),
    );
    assert.ok(pendingLoads.length >= 1, "the page loads the settings");
    let typed = false;
    for (let index = 0; index < pendingLoads.length; index += 1) {
      await act(async () => pendingLoads[index](loaded));
      if (!typed && field()) {
        await act(async () => type(field(), "16"));
        assert.equal(field().value, "16");
        typed = true;
      }
    }
    assert.ok(typed, "the expected member count field is shown");
    assert.equal(field().value, "16", "a load answered after the input keeps the typed value");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
