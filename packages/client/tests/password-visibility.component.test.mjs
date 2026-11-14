// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { test, vi } from "vitest";

vi.mock("../src/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (key) => key }) }));

import { Field } from "../src/components/ui/field.tsx";
import { Input } from "../src/components/ui/input.tsx";

// @verifies-requirement HALL-FR-USR-080
test("a password field shows what is typed on demand and hides it again when its form is sent", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      h(
        "form",
        { onSubmit: (event) => event.preventDefault() },
        h(
          Field,
          { label: "Mot de passe" },
          h(Input, {
            type: "password",
            name: "password",
            autoComplete: "current-password",
            "data-testid": "auth-password",
          }),
        ),
      ),
    );
  });
  const input = host.querySelector("input");
  const toggle = host.querySelector('[data-testid="auth-password-visibility"]');
  assert.ok(toggle, "the field carries its show and hide command");
  assert.equal(input.type, "password");
  assert.equal(input.getAttribute("autocomplete"), "current-password");
  assert.equal(toggle.getAttribute("aria-pressed"), "false");
  assert.equal(toggle.getAttribute("aria-label"), "auth.showPassword");
  assert.equal(toggle.getAttribute("type"), "button");

  await act(async () => toggle.click());
  assert.equal(input.type, "text");
  assert.equal(input.getAttribute("autocomplete"), "current-password");
  assert.equal(toggle.getAttribute("aria-pressed"), "true");
  assert.equal(toggle.getAttribute("aria-label"), "auth.hidePassword");

  await act(async () => host.querySelector("form").requestSubmit());
  assert.equal(input.type, "password");
  assert.equal(toggle.getAttribute("aria-pressed"), "false");
  await act(async () => root.unmount());
  host.remove();
});

test("a text field has no show and hide command", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => {
    root.render(h(Field, { label: "Adresse" }, h(Input, { type: "email" })));
  });
  assert.equal(host.querySelectorAll("button").length, 0);
  await act(async () => root.unmount());
});
