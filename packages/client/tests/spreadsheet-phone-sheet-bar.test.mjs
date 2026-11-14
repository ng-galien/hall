import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import postcss from "postcss";
import { test } from "vitest";

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stylesheet = postcss.parse(
  readFileSync(resolve(clientRoot, "src/features/spreadsheet/SpreadsheetResourceEditor.css"), "utf8"),
);

/** The bar under the grid as the spreadsheet engine draws it at phone width, with the elements this test names. */
const footer = new JSDOM(`<div class="spreadsheet-grid univer-spreadsheet"><section data-range-selector="true">
  <div>
    <div>
      <button data-u-comp="sheet-bar-append-button" data-name="add-sheet"></button>
      <div data-slot="dropdown-menu-trigger"><button data-u-comp="sheet-bar-append-button" data-name="sheet-menu"></button></div>
    </div>
    <div><div data-u-comp="slide-tab-bar" role="tablist">
      <div data-u-comp="slide-tab-item" role="tab" aria-selected="true" data-name="current-tab"><div>Recettes</div></div>
      <div data-u-comp="slide-tab-item" role="tab" aria-selected="false"><div>Dépenses</div></div>
    </div></div>
    <div data-name="tab-scroll-arrows">
      <button data-u-comp="sheet-bar-append-button"></button>
      <button data-u-comp="sheet-bar-append-button"></button>
    </div>
  </div>
  <div><span><span><button data-u-command="sheet.command.toggle-gridlines" data-name="gridlines"></button></span></span></div>
  <section><div>
    <button data-u-comp="button" data-name="zoom-out"></button>
    <div data-name="zoom-track"><div role="track"><a role="button"></a><button role="handle"></button></div></div>
    <button data-u-comp="button" data-name="zoom-in"></button>
    <button data-u-comp="button" aria-haspopup="menu" data-name="zoom-menu">100%</button>
  </div></section>
</section></div>`).window.document;

function declarations(media) {
  const result = [];
  stylesheet.walkRules((rule) => {
    const parent = rule.parent?.type === "atrule" ? rule.parent.params : null;
    if (
      parent !== media ||
      (!rule.selector.includes("data-range-selector") && !rule.selector.includes("slide-tab-item"))
    )
      return;
    for (const declaration of rule.nodes.filter((node) => node.type === "decl"))
      result.push({ selector: rule.selector, property: declaration.prop, value: declaration.value });
  });
  return result;
}

function named(name) {
  return footer.querySelector(`[data-name="${name}"]`);
}

function receives(element, property, value, rules) {
  return rules.some(
    (rule) => rule.property === property && rule.value === value && element.matches(rule.selector.replace(/\s+/g, " ")),
  );
}

test("at phone width the sheet bar keeps the sheet menu and the name of the current sheet", () => {
  const phone = declarations("(max-width: 760px)");
  for (const name of ["tab-scroll-arrows", "zoom-out", "zoom-in", "zoom-track"])
    assert.ok(receives(named(name), "display", "none", phone), `${name} gives way at phone width`);
  for (const name of ["add-sheet", "sheet-menu", "current-tab", "gridlines", "zoom-menu"])
    assert.ok(!receives(named(name), "display", "none", phone), `${name} stays at phone width`);
  assert.ok(receives(named("current-tab"), "flex-shrink", "0", phone), "a tab keeps the width of its name");
});

test("on a tablet or a computer the sheet bar keeps every element of the spreadsheet engine", () => {
  assert.deepEqual(declarations(null), []);
});
