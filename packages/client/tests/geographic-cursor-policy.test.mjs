import assert from "node:assert/strict";
import { test } from "vitest";
import { geographicCursor } from "../src/features/geographic/geographicCursorPolicy.ts";

const targets = ["none", "drawing", "layerFeature", "modifiedShape"];
const gestures = ["hover", "panMap", "dragShape"];

// @verifies-requirement HALL-FR-DOC-440
test("measuring and drawing keep the crosshair over the whole map, during any gesture", () => {
  for (const state of ["measure", "draw"]) {
    for (const target of targets) {
      for (const gesture of gestures) assert.equal(geographicCursor(state, target, gesture), "crosshair");
    }
  }
});

test("a clickable element shows the pointer hand before the click", () => {
  assert.equal(geographicCursor("consult", "drawing", "hover"), "pointer");
  assert.equal(geographicCursor("consult", "layerFeature", "hover"), "pointer");
  assert.equal(geographicCursor("consult", "none", "hover"), "default");
  assert.equal(geographicCursor("select", "drawing", "hover"), "pointer");
  assert.equal(geographicCursor("select", "layerFeature", "hover"), "default");
  assert.equal(geographicCursor("select", "none", "hover"), "default");
});

test("the modified shape shows the move cursor on hover and while it is dragged", () => {
  assert.equal(geographicCursor("modify", "modifiedShape", "hover"), "move");
  assert.equal(geographicCursor("modify", "modifiedShape", "dragShape"), "move");
  assert.equal(geographicCursor("modify", "drawing", "hover"), "pointer");
  assert.equal(geographicCursor("modify", "none", "hover"), "default");
});

test("dragging the map shows the closed hand outside measuring and drawing", () => {
  for (const state of ["consult", "select", "modify"]) {
    assert.equal(geographicCursor(state, "none", "panMap"), "grabbing");
  }
});

test("a map embedded in a text keeps the default cursor", () => {
  for (const target of targets) {
    for (const gesture of gestures) assert.equal(geographicCursor("fixed", target, gesture), "default");
  }
});
