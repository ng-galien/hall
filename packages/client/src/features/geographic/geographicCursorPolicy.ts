/** Tool state of a geographic map, as far as the mouse cursor is concerned. */
export type GeographicPointerState = "fixed" | "consult" | "measure" | "draw" | "select" | "modify";

/** What lies under the pointer. */
export type GeographicPointerTarget = "none" | "drawing" | "layerFeature" | "modifiedShape";

/** Pointer gesture in progress: hovering, dragging the map, or dragging the shape being modified. */
export type GeographicPointerGesture = "hover" | "panMap" | "dragShape";

export type GeographicCursor = "default" | "pointer" | "crosshair" | "move" | "grabbing";

/** Cursor of a state outside measuring and drawing, where dragging pans the map. */
function navigationCursor(gesture: GeographicPointerGesture, hovered: GeographicCursor): GeographicCursor {
  if (gesture === "panMap") return "grabbing";
  return hovered;
}

type CursorRule = (target: GeographicPointerTarget, gesture: GeographicPointerGesture) => GeographicCursor;

/** Cursor table of HALL-FR-DOC-440, one rule per tool state. */
const cursorRules: Record<GeographicPointerState, CursorRule> = {
  fixed: () => "default",
  measure: () => "crosshair",
  draw: () => "crosshair",
  consult: (target, gesture) =>
    navigationCursor(gesture, target === "drawing" || target === "layerFeature" ? "pointer" : "default"),
  select: (target, gesture) => navigationCursor(gesture, target === "drawing" ? "pointer" : "default"),
  modify: (target, gesture) =>
    gesture === "dragShape" || target === "modifiedShape"
      ? "move"
      : navigationCursor(gesture, target === "drawing" ? "pointer" : "default"),
};

/** The cursor tells, before the click, what the click will do. */
// @implements-requirement HALL-FR-DOC-440
export function geographicCursor(
  state: GeographicPointerState,
  target: GeographicPointerTarget,
  gesture: GeographicPointerGesture,
): GeographicCursor {
  return cursorRules[state](target, gesture);
}
