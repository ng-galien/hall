import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";
import { LOGO_PALETTES, logoSvg } from "../../../scripts/development/hall-icons.mjs";
import { HallLogo } from "../src/components/ui/hall-logo.tsx";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const shapes = (svg) =>
  [...svg.matchAll(/<(rect|path)\b([^>]*)\/?>/g)].map(([, tag, attributes]) =>
    [
      tag,
      ...[...attributes.matchAll(/([a-z-]+)="([^"]*)"/gi)].map(([, name, value]) => `${name}=${value}`).sort(),
    ].join(" "),
  );

const declaredColours = (css, selector, prefix) => {
  const block = css.slice(css.indexOf(selector));
  return Object.fromEntries(
    Object.keys(LOGO_PALETTES.light).map((name) => [
      name,
      block.match(new RegExp(`--${prefix}${name}: ([^;]+);`))?.[1],
    ]),
  );
};

test("the logo of the application is the drawing of its tab and application icon", () => {
  assert.deepEqual(shapes(renderToStaticMarkup(h(HallLogo))), shapes(read("../public/icons/favicon.svg")));
});

test("the tab icons of the application and of the site are the drawing of the icon script", () => {
  for (const path of ["../public/icons/favicon.svg", "../../../site/public/icons/favicon.svg"]) {
    assert.equal(read(path), logoSvg(), path);
  }
});

test("the client tokens and the site theme carry the light and dark palettes of the logo", () => {
  const tokens = read("../src/styles/tokens.css");
  assert.deepEqual(declaredColours(tokens, ":root {", "hall-color-logo-"), LOGO_PALETTES.light);
  assert.deepEqual(declaredColours(tokens, ':root[data-theme="dark"]', "hall-color-logo-"), LOGO_PALETTES.dark);
  const site = read("../../../site/src/theme.css");
  assert.deepEqual(declaredColours(site, ":root,\n.logo-light {", "logo-"), LOGO_PALETTES.light);
  assert.deepEqual(declaredColours(site, ':root[data-theme="dark"] {\n  --logo-', "logo-"), LOGO_PALETTES.dark);
});

test("the sidebar and the help site draw the logo of Hall instead of the letter H", () => {
  for (const source of ["../src/shell/AppSidebar.tsx", "../src/docs/DocsSite.tsx"]) {
    const text = read(source);
    assert.match(text, /<HallLogo\b/, source);
    assert.doesNotMatch(text, />H</, source);
  }
});
