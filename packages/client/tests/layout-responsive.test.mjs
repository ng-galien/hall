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
test("a viewport change before the media subscription still removes the anchored menu below the phone threshold", async () => {
  const original = Object.getOwnPropertyDescriptor(window, "matchMedia");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // jsdom measures nothing: the screen header observes its row without receiving sizes.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
  const host = document.createElement("div");
  const root = createRoot(host);
  // The window becomes a phone between the first reading and the subscription.
  const phoneQuery = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const readPhone = vi.fn().mockReturnValueOnce({ matches: false }).mockReturnValue(phoneQuery);
  // Below 1000 pixels the menu stays anchored at the left, folded in its rail (decision of 12 November 2026).
  const narrowQuery = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((media) => (media === "(max-width: 760px)" ? readPhone() : narrowQuery)),
  });
  try {
    await act(async () => root.render(h(MemoryRouter, null, h(Layout))));
    assert.equal(host.querySelector('[data-testid="sidebar"]'), null, "no anchored menu on a phone");
    const listener = phoneQuery.addEventListener.mock.calls[0][1];
    await act(async () => {
      phoneQuery.matches = false;
      listener();
    });
    assert.ok(host.querySelector('[data-testid="sidebar"]'), "the anchored menu above the phone, also below 1000 px");
  } finally {
    await act(async () => root.unmount());
    if (original) Object.defineProperty(window, "matchMedia", original);
    else Reflect.deleteProperty(window, "matchMedia");
    vi.unstubAllGlobals();
  }
});
