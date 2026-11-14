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
  const title = host.querySelector(".authentication-screen-title");
  return {
    logo: element.querySelector('[data-testid="hall-logo"]'),
    heading: element.querySelector("h1")?.textContent,
    text: [...element.children].map((child) => child.textContent.trim()).filter(Boolean),
    title: title?.textContent ?? null,
    titleOutsideHeader: !title || !element.contains(title),
  };
};

// @verifies-requirement HALL-FR-USR-080
test("the sign-in screen is headed by the logo of Hall and the commune as its title, Hall under it, and no other title", async () => {
  communeName = "Foncine-le-Bas";
  const { host, unmount } = await render("/");
  const { logo, heading, text, title } = header(host);
  assert.ok(logo);
  assert.equal(heading, "Foncine-le-Bas");
  assert.deepEqual(text, ["Foncine-le-Bas", "app.name"]);
  assert.equal(title, null);
  assert.equal(host.querySelector(".eyebrow"), null);
  await unmount();
});

// @verifies-requirement HALL-FR-USR-080
test("an expired link screen keeps its own title under the commune, and without a commune name Hall is the title", async () => {
  communeName = "Foncine-le-Bas";
  let screen = await render("/password-link#expired");
  let head = header(screen.host);
  assert.equal(head.heading, "Foncine-le-Bas");
  assert.equal(head.title, "auth.passwordLinkExpiredTitle");
  assert.ok(head.titleOutsideHeader);
  await screen.unmount();
  communeName = "";
  screen = await render("/password-link#expired");
  head = header(screen.host);
  assert.equal(head.heading, "app.name");
  assert.deepEqual(head.text, ["app.name"]);
  assert.equal(screen.host.querySelector('[data-testid="authentication-commune"]'), null);
  await screen.unmount();
});
