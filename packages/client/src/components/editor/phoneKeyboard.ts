import type { ChainedCommands, Editor } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { useEffect } from "react";

/** Whether the person is writing in a phone editor: true from a touch on the text until a touch elsewhere. */
const writing = new WeakMap<EditorView, { active: boolean }>();

const phoneKeyboardKey = new PluginKey("phoneKeyboard");

/** A menu, a sheet or a dialog opened from the tools of the editor: the writing goes on behind it. */
function inEditorTool(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest('[role="menu"], [role="dialog"], [role="listbox"], [data-radix-popper-content-wrapper]'))
  );
}

/** A command inside an element of the text: a button or a handle of an image, of a map or of a document. */
function inElementCommand(view: EditorView, target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const element = target.closest('[contenteditable="false"]');
  return (
    Boolean(element && view.dom.contains(element)) &&
    Boolean(target.closest('button, input, [role="button"], [role="slider"]'))
  );
}

/** Position of the block of the text that is selected whole and never typed into (image, map, document, rule), if any. */
function wholeBlockAt(view: EditorView, event: MouseEvent): number | null {
  const found = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!found || found.inside < 0) return null;
  const node = view.state.doc.nodeAt(found.inside);
  return node?.isBlock && node.isAtom && NodeSelection.isSelectable(node) ? found.inside : null;
}

// @implements-requirement HALL-FR-LAY-010
/**
 * On a phone, the keyboard opens only when the person touches the text to write. Touching an image, a map, a document
 * or a rule of the text selects it and closes the keyboard; a command of such an element leaves the text without the
 * focus. The person is still writing while a menu, a sheet or a dialog of the editor is open.
 */
function phoneKeyboard() {
  return new Plugin({
    key: phoneKeyboardKey,
    view(view) {
      const state = { active: view.hasFocus() };
      writing.set(view, state);
      const onFocus = () => {
        state.active = true;
      };
      const onBlur = (event: FocusEvent) => {
        state.active = inEditorTool(event.relatedTarget);
      };
      const onPointerDown = (event: PointerEvent) => {
        if (!view.hasFocus() && !inEditorTool(event.target) && !view.dom.contains(event.target as Node))
          state.active = false;
      };
      view.dom.addEventListener("focus", onFocus);
      view.dom.addEventListener("blur", onBlur);
      document.addEventListener("pointerdown", onPointerDown, true);
      return {
        destroy() {
          view.dom.removeEventListener("focus", onFocus);
          view.dom.removeEventListener("blur", onBlur);
          document.removeEventListener("pointerdown", onPointerDown, true);
          writing.delete(view);
        },
      };
    },
    props: {
      handleDOMEvents: {
        mousedown(view, event) {
          if (!view.editable || event.button !== 0) return false;
          if (inElementCommand(view, event.target)) {
            const state = writing.get(view);
            if (state) state.active = false;
            return true;
          }
          const position = wholeBlockAt(view, event);
          if (position === null) return false;
          event.preventDefault();
          view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, position)));
          const state = writing.get(view);
          if (state) state.active = false;
          if (view.hasFocus()) (view.dom as HTMLElement).blur();
          return true;
        },
      },
    },
  });
}

/** Installs the phone keyboard rules on the editor while the layout is a phone's. */
export function usePhoneKeyboard(editor: Editor | null, phone: boolean) {
  useEffect(() => {
    if (!editor || !phone || editor.isDestroyed) return;
    editor.registerPlugin(phoneKeyboard());
    return () => {
      if (!editor.isDestroyed) editor.unregisterPlugin(phoneKeyboardKey);
    };
  }, [editor, phone]);
}

/** True when a command of the editor gives the focus back to the text: always, except on a phone when no one writes. */
export function focusesText(view: EditorView): boolean {
  const state = writing.get(view);
  return !state || view.hasFocus() || state.active;
}

/** The command chain of a writing tool: it keeps the keyboard as it is, open while writing and closed otherwise. */
export function writingChain(editor: Editor): ChainedCommands {
  return focusesText(editor.view) ? editor.chain().focus() : editor.chain();
}
