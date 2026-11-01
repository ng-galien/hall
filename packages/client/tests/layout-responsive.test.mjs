// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { test, vi } from "vitest";

vi.mock("../src/features/search/GlobalSearchPalette", () => ({ GlobalSearchPalette: () => null }));
vi.mock("../src/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (key) => key }) }));
vi.mock("../src/shell/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("../src/shell/AppSidebar", () => ({ AppSidebar: () => h("aside", { "data-testid": "sidebar" }) }));
vi.mock("../src/components/ui/dialog", () => ({
  Dialog: ({ open, children }) => (open ? children : null),
  DialogContent: ({ children }) => children,
  DialogTitle: ({ children }) => children,
}));

import { Layout } from "../src/components/Layout.tsx";

// @verifies-requirement HALL-FR-LAY-010
test("a viewport change before the media subscription still removes desktop navigation", async () => {
  const original = Object.getOwnPropertyDescriptor(window, "matchMedia");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  const query = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValueOnce({ matches: false }).mockReturnValue(query),
  });
  try {
    await act(async () => root.render(h(MemoryRouter, null, h(Layout))));
    assert.equal(host.querySelector('[data-testid="sidebar"]') === null, true);
    const listener = query.addEventListener.mock.calls[0][1];
    await act(async () => {
      query.matches = false;
      listener();
    });
    assert.ok(host.querySelector('[data-testid="sidebar"]'));
  } finally {
    await act(async () => root.unmount());
    if (original) Object.defineProperty(window, "matchMedia", original);
    else Reflect.deleteProperty(window, "matchMedia");
    vi.unstubAllGlobals();
  }
});
