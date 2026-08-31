export interface SpreadsheetCellAddress {
  column: number;
  row: number;
}

export interface SpreadsheetSelection {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SpreadsheetTextRange {
  start: number;
  end: number;
}

export type SpreadsheetEditing =
  | { kind: "idle" }
  | {
      kind: "formula";
      target: SpreadsheetCellAddress;
      original: string;
      draft: string;
      caret: SpreadsheetTextRange;
    }
  | {
      kind: "native";
      target: SpreadsheetCellAddress;
      original: string;
      draft: string;
    };

export type SpreadsheetReferenceGesture =
  | { kind: "none" }
  | { kind: "picking"; referenceIndex: number | null }
  | { kind: "resizing"; referenceIndex: number };

export type SpreadsheetPopup =
  | { kind: "closed" }
  | { kind: "autocomplete" }
  | { kind: "catalog" }
  | { kind: "autoSum" };

export interface SpreadsheetInteractionState {
  selection: SpreadsheetSelection;
  editing: SpreadsheetEditing;
  referenceGesture: SpreadsheetReferenceGesture;
  popup: SpreadsheetPopup;
  formulaBarExpanded: boolean;
}

export type SpreadsheetInteractionEvent =
  | { type: "SELECTION_CHANGED"; selection: SpreadsheetSelection }
  | {
      type: "FORMULA_EDIT_STARTED";
      target: SpreadsheetCellAddress;
      original: string;
      caret: SpreadsheetTextRange;
    }
  | {
      type: "NATIVE_EDIT_STARTED";
      target: SpreadsheetCellAddress;
      original: string;
    }
  | { type: "DRAFT_CHANGED"; draft: string; caret?: SpreadsheetTextRange }
  | { type: "CARET_CHANGED"; caret: SpreadsheetTextRange }
  | { type: "COMMIT_REQUESTED" }
  | { type: "CANCEL_REQUESTED" }
  | { type: "NATIVE_EDIT_ENDED"; wasSaved: boolean }
  | { type: "REFERENCE_PICK_STARTED"; referenceIndex: number | null }
  | { type: "REFERENCE_RESIZE_STARTED"; referenceIndex: number }
  | { type: "REFERENCE_GESTURE_ENDED" }
  | { type: "POPUP_CHANGED"; popup: SpreadsheetPopup }
  | { type: "FORMULA_BAR_TOGGLED" };

export type SpreadsheetInteractionCommand =
  | { type: "EDITING_CHANGED"; editing: boolean }
  | { type: "WRITE_FORMULA"; target: SpreadsheetCellAddress; value: string }
  | { type: "RESTORE_FORMULA"; value: string; caret: SpreadsheetTextRange };

export interface SpreadsheetInteractionTransition {
  state: SpreadsheetInteractionState;
  commands: SpreadsheetInteractionCommand[];
}

export function initialSpreadsheetInteraction(): SpreadsheetInteractionState {
  return {
    selection: { left: 0, top: 0, right: 0, bottom: 0 },
    editing: { kind: "idle" },
    referenceGesture: { kind: "none" },
    popup: { kind: "closed" },
    formulaBarExpanded: false,
  };
}

export function transitionSpreadsheetInteraction(
  state: SpreadsheetInteractionState,
  event: SpreadsheetInteractionEvent,
): SpreadsheetInteractionTransition {
  switch (event.type) {
    case "SELECTION_CHANGED":
      return { state: { ...state, selection: event.selection }, commands: [] };
    case "FORMULA_EDIT_STARTED":
      if (state.editing.kind !== "idle") return { state, commands: [] };
      return {
        state: {
          ...state,
          editing: {
            kind: "formula",
            target: event.target,
            original: event.original,
            draft: event.original,
            caret: event.caret,
          },
        },
        commands: [{ type: "EDITING_CHANGED", editing: true }],
      };
    case "NATIVE_EDIT_STARTED":
      if (state.editing.kind !== "idle") return { state, commands: [] };
      return {
        state: {
          ...state,
          editing: {
            kind: "native",
            target: event.target,
            original: event.original,
            draft: event.original,
          },
        },
        commands: [{ type: "EDITING_CHANGED", editing: true }],
      };
    case "DRAFT_CHANGED":
      if (state.editing.kind === "idle") return { state, commands: [] };
      return {
        state: {
          ...state,
          editing:
            state.editing.kind === "formula"
              ? { ...state.editing, draft: event.draft, caret: event.caret ?? state.editing.caret }
              : { ...state.editing, draft: event.draft },
        },
        commands: [],
      };
    case "CARET_CHANGED":
      if (state.editing.kind !== "formula") return { state, commands: [] };
      return { state: { ...state, editing: { ...state.editing, caret: event.caret } }, commands: [] };
    case "COMMIT_REQUESTED":
      if (state.editing.kind !== "formula") return { state, commands: [] };
      return {
        state: { ...state, editing: { kind: "idle" }, referenceGesture: { kind: "none" }, popup: { kind: "closed" } },
        commands: [
          ...(state.editing.draft === state.editing.original
            ? []
            : [{ type: "WRITE_FORMULA", target: state.editing.target, value: state.editing.draft } as const]),
          { type: "EDITING_CHANGED", editing: false },
        ],
      };
    case "CANCEL_REQUESTED":
      if (state.editing.kind === "idle") return { state, commands: [] };
      return {
        state: { ...state, editing: { kind: "idle" }, referenceGesture: { kind: "none" }, popup: { kind: "closed" } },
        commands: [
          ...(state.editing.kind === "formula"
            ? [
                {
                  type: "RESTORE_FORMULA",
                  value: state.editing.original,
                  caret: { start: state.editing.original.length, end: state.editing.original.length },
                } as const,
              ]
            : []),
          { type: "EDITING_CHANGED", editing: false },
        ],
      };
    case "NATIVE_EDIT_ENDED":
      if (state.editing.kind !== "native") return { state, commands: [] };
      return {
        state: { ...state, editing: { kind: "idle" }, referenceGesture: { kind: "none" }, popup: { kind: "closed" } },
        commands: [
          ...(event.wasSaved
            ? []
            : [
                {
                  type: "RESTORE_FORMULA",
                  value: state.editing.original,
                  caret: { start: state.editing.original.length, end: state.editing.original.length },
                } as const,
              ]),
          { type: "EDITING_CHANGED", editing: false },
        ],
      };
    case "REFERENCE_PICK_STARTED":
      return { state: { ...state, referenceGesture: { kind: "picking", referenceIndex: event.referenceIndex } }, commands: [] };
    case "REFERENCE_RESIZE_STARTED":
      return { state: { ...state, referenceGesture: { kind: "resizing", referenceIndex: event.referenceIndex } }, commands: [] };
    case "REFERENCE_GESTURE_ENDED":
      return { state: { ...state, referenceGesture: { kind: "none" } }, commands: [] };
    case "POPUP_CHANGED":
      return { state: { ...state, popup: event.popup }, commands: [] };
    case "FORMULA_BAR_TOGGLED":
      return { state: { ...state, formulaBarExpanded: !state.formulaBarExpanded }, commands: [] };
  }
}
