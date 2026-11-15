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

/** The spreadsheet as Hall frames it, with the sheet tabs of the touch interface of the library under the grid. */
function editor(attributes) {
  return new JSDOM(`<div class="spreadsheet-editor" ${attributes}><div class="spreadsheet-grid univer-spreadsheet">
  <div data-u-comp="app-layout"><section><div></div>
    <footer><div data-name="sheet-tabs"><div><div>Dépenses</div><div>Hypothèses</div></div></div></footer>
  </section></div></div></div>`).window.document;
}

function receives(element, property, value) {
  let found = false;
  stylesheet.walkRules((rule) => {
    if (!element.matches(rule.selector)) return;
    for (const declaration of rule.nodes)
      if (declaration.type === "decl" && declaration.prop === property && declaration.value === value) found = true;
  });
  return found;
}

const tabs = (document) => document.querySelector('[data-name="sheet-tabs"]');

// @verifies-requirement HALL-FR-LAY-180
test("on a phone the sheet tabs are finger-sized and give their place to the grid while a cell is typed", () => {
  const reading = editor('data-layout="phone"');
  assert.ok(receives(tabs(reading), "height", "var(--hall-size-touch-control)"));
  assert.ok(!receives(tabs(reading).parentElement, "display", "none"), "the tabs stay while reading");
  const typing = editor('data-layout="phone" data-writing="true" data-typing="true"');
  assert.ok(receives(tabs(typing).parentElement, "display", "none"), "the tabs give way while a cell is typed");
});

test("on a tablet or a computer the sheet bar of the library keeps its own drawing", () => {
  const computer = editor("");
  assert.ok(!receives(tabs(computer), "height", "var(--hall-size-touch-control)"));
  assert.ok(!receives(tabs(computer).parentElement, "display", "none"));
});
