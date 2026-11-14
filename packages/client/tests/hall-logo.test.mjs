import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";
import { HallLogo } from "../src/components/ui/hall-logo.tsx";

const shapes = (svg) =>
  [...svg.matchAll(/<(rect|path)\b([^>]*)\/?>/g)].map(([, tag, attributes]) =>
    [
      tag,
      ...[...attributes.matchAll(/([a-z-]+)="([^"]*)"/gi)].map(([, name, value]) => `${name}=${value}`).sort(),
    ].join(" "),
  );

test("the logo of the application is the drawing of its tab and application icon", () => {
  const icon = readFileSync(new URL("../public/icons/favicon.svg", import.meta.url), "utf8");
  const logo = renderToStaticMarkup(h(HallLogo));
  assert.deepEqual(shapes(logo), shapes(icon));
  assert.match(icon, /fill="#ffffff"/);
  assert.match(icon, /fill="#2457d6"/);
});

test("the sidebar and the help site draw the logo of Hall instead of the letter H", () => {
  for (const source of ["../src/shell/AppSidebar.tsx", "../src/docs/DocsSite.tsx"]) {
    const text = readFileSync(new URL(source, import.meta.url), "utf8");
    assert.match(text, /<HallLogo\b/, source);
    assert.doesNotMatch(text, />H</, source);
  }
});
