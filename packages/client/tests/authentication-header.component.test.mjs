// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { test, vi } from "vitest";

vi.mock("../src/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (key) => key }) }));
const status = {
  bootstrapRequired: false,
  bootstrapAllowed: true,
  bootstrapTokenRequired: false,
  developmentAccess: false,
};
let communeName = "Foncine-le-Bas";
vi.mock("../src/services/authApi", () => ({
  getAuthenticationStatus: async () => ({
    data: { ...status, communeName },
    representation: { class: ["authentication-status"], properties: { ...status, communeName }, actions: [] },
  }),
  getSession: async () => {
    const { ApiError } = await import("../src/services/apiClient");
    throw new ApiError("authentication_required", 401);
  },
  passwordLinksAvailable: () => false,
  authenticate: async () => null,
  changePassword: async () => undefined,
  logout: async () => true,
  openPasswordLink: async () => null,
  requestPasswordLink: async () => undefined,
  completePasswordLink: async () => undefined,
}));

import { AuthenticationGate } from "../src/components/AuthenticationGate.tsx";

async function render(path) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => {
    root.render(h(MemoryRouter, { initialEntries: [path] }, h(AuthenticationGate, null, h("p", null, "application"))));
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  return { host, unmount: () => act(async () => root.unmount()) };
}

const header = (host) => {
  const element = host.querySelector('[data-testid="authentication-header"]');
  assert.ok(element, "the screen carries the head of the sign-in screens");
  return {
    logo: element.querySelector('[data-testid="hall-logo"]'),
    text: [...element.children].map((child) => child.textContent.trim()),
  };
};

// @verifies-requirement HALL-FR-USR-080
test("the sign-in screen shows the logo and the name of Hall, then the commune, then its title", async () => {
  communeName = "Foncine-le-Bas";
  const { host, unmount } = await render("/");
  const { logo, text } = header(host);
  assert.ok(logo);
  assert.deepEqual(text, ["app.name", "Foncine-le-Bas", "auth.signInTitle"]);
  assert.equal(host.querySelector(".eyebrow"), null);
  await unmount();
});

// @verifies-requirement HALL-FR-USR-080
test("an expired link screen names the commune, and a screen of an installation without a name shows Hall alone", async () => {
  communeName = "Foncine-le-Bas";
  let screen = await render("/password-link#expired");
  assert.deepEqual(header(screen.host).text, ["app.name", "Foncine-le-Bas", "auth.passwordLinkExpiredTitle"]);
  await screen.unmount();
  communeName = "";
  screen = await render("/password-link#expired");
  assert.deepEqual(header(screen.host).text, ["app.name", "auth.passwordLinkExpiredTitle"]);
  assert.equal(screen.host.querySelector('[data-testid="authentication-commune"]'), null);
  await screen.unmount();
});
