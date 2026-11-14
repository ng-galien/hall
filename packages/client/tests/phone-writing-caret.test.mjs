import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { keepCaretBelowWritingTools } from "../src/components/editor/phoneWritingScroll.ts";

const editorStyles = readFileSync(join(import.meta.dirname, "..", "src", "styles", "editor.css"), "utf8");

function fakeView({ focused = true } = {}) {
  const props = [];
  const dispatched = [];
  const transaction = {
    scrolled: false,
    scrollIntoView() {
      this.scrolled = true;
      return this;
    },
  };
  return {
    props,
    dispatched,
    view: {
      isDestroyed: false,
      hasFocus: () => focused,
      setProps: (next) => props.push(next),
      get state() {
        return { tr: { ...transaction } };
      },
      dispatch: (tr) => dispatched.push(tr),
    },
  };
}

const tools = (height) => ({ getBoundingClientRect: () => ({ height }) });

// @verifies-requirement HALL-FR-LAY-130
test("on a phone the caret scrolls into view as soon as it goes under the writing tools, not at the edge of the area", () => {
  const { view, props } = fakeView();
  const cleanup = keepCaretBelowWritingTools(view, tools(45), new EventTarget());
  const last = props.at(-1);
  assert.ok(last.scrollThreshold.top > 45, "the caret under the tools triggers a scroll");
  assert.ok(last.scrollMargin.top > 45, "the scroll leaves the caret line below the tools");
  assert.ok(last.scrollMargin.bottom > 0);
  cleanup();
});

// @verifies-requirement HALL-FR-LAY-130
test("on a phone the caret is revealed again when the visible window opens or closes the keyboard", () => {
  const visible = new EventTarget();
  const { view, dispatched } = fakeView();
  const cleanup = keepCaretBelowWritingTools(view, tools(45), visible);
  visible.dispatchEvent(new Event("resize"));
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].scrolled, true);
  cleanup();
  visible.dispatchEvent(new Event("resize"));
  assert.equal(dispatched.length, 1, "no reveal after the editor leaves the writing screen");
});

test("a resize without focus in the text does not move the text", () => {
  const visible = new EventTarget();
  const { view, dispatched } = fakeView({ focused: false });
  const cleanup = keepCaretBelowWritingTools(view, tools(45), visible);
  visible.dispatchEvent(new Event("resize"));
  assert.equal(dispatched.length, 0);
  cleanup();
});

// @verifies-requirement HALL-FR-LAY-130
test("while a text is written on a phone, the row above the writing tools is not pulled up under them", () => {
  const rule = editorStyles.match(/([^{}]*\.markdown-editor-phone[^{}]*>\s*\.workspace-topzone[^{}]*)\{([^}]*)\}/);
  assert.ok(rule, "the writing screen sets the margins of the row above its tools");
  assert.match(rule[2], /margin-block:\s*0\s*;/);
});

// @verifies-requirement HALL-FR-LAY-130
test("the page and the frame of every screen take the height of the visible window, never a viewport unit", () => {
  const styles = (name) => readFileSync(join(import.meta.dirname, "..", "src", "styles", name), "utf8");
  const shell = styles("shell.css").match(/\.app-shell\s*\{([^}]*)\}/)[1];
  assert.match(shell, /(?:^|;)\s*height:\s*100%\s*;/);
  const body = styles("base.css").match(/\bbody\s*\{([^}]*)\}/)[1];
  assert.doesNotMatch(`${shell}${body}`, /\d+(?:s|l|d)?vh\b/);
});
