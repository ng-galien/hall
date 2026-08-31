import assert from "node:assert/strict";
import test from "node:test";
import {
  initialSpreadsheetInteraction,
  transitionSpreadsheetInteraction,
} from "../src/features/spreadsheet/spreadsheetInteraction.ts";

const target = { column: 2, row: 3 };
const caret = { start: 2, end: 2 };
const transition = (state, event) => transitionSpreadsheetInteraction(state, event);

test("initial interaction is idle and closed", () => {
  assert.deepEqual(initialSpreadsheetInteraction(), {
    selection: { left: 0, top: 0, right: 0, bottom: 0 },
    editing: { kind: "idle" },
    referenceGesture: { kind: "none" },
    popup: { kind: "closed" },
    formulaBarExpanded: false,
  });
});

test("selection, popup, reference gestures and expansion are explicit", () => {
  let state = initialSpreadsheetInteraction();
  state = transition(state, { type: "SELECTION_CHANGED", selection: { left: 1, top: 2, right: 3, bottom: 4 } }).state;
  state = transition(state, { type: "REFERENCE_PICK_STARTED", referenceIndex: null }).state;
  assert.deepEqual(state.referenceGesture, { kind: "picking", referenceIndex: null });
  state = transition(state, { type: "REFERENCE_RESIZE_STARTED", referenceIndex: 1 }).state;
  assert.deepEqual(state.referenceGesture, { kind: "resizing", referenceIndex: 1 });
  state = transition(state, { type: "REFERENCE_GESTURE_ENDED" }).state;
  state = transition(state, { type: "POPUP_CHANGED", popup: { kind: "catalog" } }).state;
  state = transition(state, { type: "FORMULA_BAR_TOGGLED" }).state;
  assert.deepEqual(state.selection, { left: 1, top: 2, right: 3, bottom: 4 });
  assert.deepEqual(state.referenceGesture, { kind: "none" });
  assert.deepEqual(state.popup, { kind: "catalog" });
  assert.equal(state.formulaBarExpanded, true);
  assert.equal(transition(state, { type: "FORMULA_BAR_TOGGLED" }).state.formulaBarExpanded, false);
});

test("formula editing updates draft and caret then writes exactly once", () => {
  let result = transition(initialSpreadsheetInteraction(), {
    type: "FORMULA_EDIT_STARTED", target, original: "=A1", caret,
  });
  assert.deepEqual(result.commands, [{ type: "EDITING_CHANGED", editing: true }]);
  const originalSession = result.state;
  result = transition(result.state, {
    type: "FORMULA_EDIT_STARTED", target: { column: 9, row: 9 }, original: "=Z9", caret: { start: 0, end: 0 },
  });
  assert.deepEqual(result, { state: originalSession, commands: [] });
  result = transition(result.state, { type: "DRAFT_CHANGED", draft: "=A1+1", caret: { start: 5, end: 5 } });
  result = transition(result.state, { type: "CARET_CHANGED", caret: { start: 3, end: 4 } });
  assert.deepEqual(result.state.editing, {
    kind: "formula", target, original: "=A1", draft: "=A1+1", caret: { start: 3, end: 4 },
  });
  result = transition(result.state, { type: "COMMIT_REQUESTED" });
  assert.deepEqual(result.commands, [
    { type: "WRITE_FORMULA", target, value: "=A1+1" },
    { type: "EDITING_CHANGED", editing: false },
  ]);
  assert.deepEqual(result.state.editing, { kind: "idle" });
  assert.deepEqual(transition(result.state, { type: "COMMIT_REQUESTED" }).commands, []);
});

test("unchanged formula commits without a write and cancel restores its original", () => {
  const started = transition(initialSpreadsheetInteraction(), {
    type: "FORMULA_EDIT_STARTED", target, original: "=A1", caret,
  }).state;
  assert.deepEqual(transition(started, { type: "COMMIT_REQUESTED" }).commands, [
    { type: "EDITING_CHANGED", editing: false },
  ]);
  const changed = transition(started, { type: "DRAFT_CHANGED", draft: "=B2" }).state;
  assert.deepEqual(transition(changed, { type: "CANCEL_REQUESTED" }).commands, [
    { type: "RESTORE_FORMULA", value: "=A1", caret: { start: 3, end: 3 } },
    { type: "EDITING_CHANGED", editing: false },
  ]);
  assert.deepEqual(transition(initialSpreadsheetInteraction(), { type: "CANCEL_REQUESTED" }).commands, []);
});

test("native edit closing never writes a cell", () => {
  let result = transition(initialSpreadsheetInteraction(), {
    type: "NATIVE_EDIT_STARTED", target, original: "12",
  });
  assert.deepEqual(result.commands, [{ type: "EDITING_CHANGED", editing: true }]);
  result = transition(result.state, { type: "DRAFT_CHANGED", draft: "13", caret });
  assert.deepEqual(result.state.editing, { kind: "native", target, original: "12", draft: "13" });
  assert.deepEqual(transition(result.state, { type: "CARET_CHANGED", caret }).state, result.state);
  assert.deepEqual(transition(result.state, {
    type: "NATIVE_EDIT_STARTED", target: { column: 9, row: 9 }, original: "13",
  }), { state: result.state, commands: [] });
  assert.deepEqual(transition(result.state, { type: "NATIVE_EDIT_ENDED", wasSaved: true }).commands, [
    { type: "EDITING_CHANGED", editing: false },
  ]);
  assert.deepEqual(transition(result.state, { type: "NATIVE_EDIT_ENDED", wasSaved: false }).commands, [
    { type: "RESTORE_FORMULA", value: "12", caret: { start: 2, end: 2 } },
    { type: "EDITING_CHANGED", editing: false },
  ]);
  assert.deepEqual(transition(result.state, { type: "CANCEL_REQUESTED" }).commands, [
    { type: "EDITING_CHANGED", editing: false },
  ]);
  assert.deepEqual(transition(initialSpreadsheetInteraction(), { type: "NATIVE_EDIT_ENDED", wasSaved: false }).commands, []);
});

test("draft events outside editing are ignored", () => {
  const state = initialSpreadsheetInteraction();
  assert.deepEqual(transition(state, { type: "DRAFT_CHANGED", draft: "ignored" }), { state, commands: [] });
  assert.deepEqual(transition(state, { type: "CARET_CHANGED", caret }), { state, commands: [] });
});
