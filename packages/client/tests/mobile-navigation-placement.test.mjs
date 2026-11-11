// @vitest-environment jsdom
// @verifies-requirement HALL-FR-LAY-010
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, test, vi } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "../src/components/ui/dialog.tsx";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

const clientRoot = join(import.meta.dirname, "..");
const read = (path) => readFileSync(join(clientRoot, path), "utf8");

let root;
let container;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

test("a left dialog is a full-height panel anchored to the left edge, without centering", () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(
      h(
        Dialog,
        { open: true },
        h(DialogContent, { placement: "left", "aria-describedby": undefined }, h(DialogTitle, null, "Navigation")),
      ),
    ),
  );
  const classes = document.querySelector('[data-slot="dialog-content"]').classList;
  for (const expected of ["inset-y-0", "left-0", "h-dvh", "flex-col", "overflow-y-auto"])
    assert.ok(classes.contains(expected), expected);
  for (const centering of ["top-1/2", "left-1/2", "-translate-x-1/2", "-translate-y-1/2"])
    assert.ok(!classes.contains(centering), centering);
});

test("the mobile navigation uses the left dialog placement instead of overriding the centered one", () => {
  assert.match(read("src/components/Layout.tsx"), /className="app-mobile-navigation"\s+placement="left"/);
  const rule = read("src/styles/shell.css").match(/\.app-mobile-navigation \{([^}]*)\}/)[1];
  assert.doesNotMatch(rule, /\b(inset|transform|translate|top|left|height)\s*:/);
});
