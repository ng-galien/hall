import type { EditorView } from "@tiptap/pm/view";

/** Room kept between the line of the caret and the edges of the visible writing area, as ProseMirror's default. */
const caretClearance = 5;

/** The part of the window that the editor listens to: the visible window, which shrinks while the keyboard is open. */
export type VisibleWindow = Pick<EventTarget, "addEventListener" | "removeEventListener">;

// @implements-requirement HALL-FR-LAY-130
/**
 * Keeps the line of the caret of a phone text between its writing tools, fixed at the top of the scrolled area, and
 * the bottom of the visible window: the editor scrolls as soon as the caret goes under the tools, and reveals the
 * caret again when the visible window changes height, as when the keyboard opens or closes. Returns the cleanup.
 */
export function keepCaretBelowWritingTools(
  view: EditorView,
  tools: HTMLElement,
  visibleWindow: VisibleWindow = window.visualViewport ?? window,
): () => void {
  const applyTools = () => {
    const top = tools.getBoundingClientRect().height + caretClearance;
    const edges = { top, right: caretClearance, bottom: caretClearance, left: caretClearance };
    view.setProps({ scrollThreshold: edges, scrollMargin: edges });
  };
  const reveal = () => {
    if (view.isDestroyed) return;
    applyTools();
    if (view.hasFocus()) view.dispatch(view.state.tr.scrollIntoView());
  };
  applyTools();
  visibleWindow.addEventListener("resize", reveal);
  return () => visibleWindow.removeEventListener("resize", reveal);
}
