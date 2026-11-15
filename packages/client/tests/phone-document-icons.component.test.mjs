// @vitest-environment jsdom
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { test, vi } from "vitest";

vi.mock("../src/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (key) => key }) }));
vi.mock("../src/shell/usePhoneLayout", () => ({ usePhoneLayout: () => true }));
vi.mock("../src/shell/headerTrail", () => ({ ScreenActions: ({ children }) => children }));

import { useTextWriting } from "../src/features/resources/useTextWriting.tsx";

const source = (path) => readFileSync(join(import.meta.dirname, "..", "src", path), "utf8");

// @verifies-requirement HALL-FR-LAY-130
test("on a phone « Modifier » is the pencil of the icons of the application, named Modifier, not a filled word", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  function Reading() {
    const text = { id: "t", editable: true, content: "Texte", dirty: false };
    return useTextWriting(text).button;
  }
  await act(async () => root.render(h(Reading)));
  const edit = host.querySelector('[data-testid="text-edit"]');
  assert.ok(edit);
  assert.equal(edit.getAttribute("aria-label"), "common.edit");
  assert.equal(edit.getAttribute("data-variant"), "plain");
  assert.ok(edit.querySelector("svg"), "an icon");
  assert.equal(edit.textContent.trim(), "");
  await act(async () => root.unmount());
});

// @verifies-requirement HALL-FR-LAY-130
test("the writing tools of a phone are icons of the application in the tone of the other commands", () => {
  const editor = source("components/editor/MarkdownEditor.tsx");
  const bar = editor.slice(editor.indexOf("function PhoneTool("), editor.indexOf("function useMentionGroupLabels"));
  for (const icon of [
    "<BoldIcon />",
    "<ItalicIcon />",
    "<HeadingIcon />",
    "<ListBulletedIcon />",
    "<FormattingIcon />",
  ])
    assert.ok(bar.includes(icon), icon);
  assert.doesNotMatch(bar, /Short"\)/);
  const photo = source("components/editor/ImageFileControls.tsx");
  assert.match(
    photo,
    /data-testid="editor-photo"[\s\S]{0,200}aria-label=\{t\("editor\.photo"\)\}[\s\S]{0,200}<CameraIcon \/>/,
  );
  const styles = source("styles/editor.css");
  const tools = styles.slice(styles.indexOf(".markdown-phone-tool"), styles.indexOf(".markdown-phone-toolbar-end"));
  assert.doesNotMatch(tools.replace(/\[aria-pressed="true"\][^}]*\}/, ""), /color:|font-/);
});

// @verifies-requirement HALL-FR-DOC-270
test("every command of the computer writing bar is reached from the single writing bar of a phone", () => {
  const editor = source("components/editor/MarkdownEditor.tsx");
  const bar = editor.slice(editor.indexOf("function PhoneTool("), editor.indexOf("function useMentionGroupLabels"));
  const phoneEquivalent = {
    "editor-undo": "editor-formatting-undo",
    "editor-redo": "editor-formatting-redo",
    "editor-underline": "editor-formatting-underline",
    "editor-code": "editor-formatting-code",
    "editor-numbered-list": "editor-formatting-numbered-list",
    "editor-checklist": "editor-formatting-checklist",
    "editor-indent": "editor-formatting-indent",
    "editor-outdent": "editor-formatting-outdent",
    "editor-link": "editor-formatting-link",
    "editor-insert-table": "editor-formatting-insert-table",
    "editor-block-style": "editor-heading",
  };
  const desktop = [
    "editor-undo",
    "editor-redo",
    "editor-block-style",
    "editor-bold",
    "editor-italic",
    "editor-underline",
    "editor-code",
    "editor-bullet-list",
    "editor-numbered-list",
    "editor-checklist",
    "editor-indent",
    "editor-outdent",
    "editor-link",
    "editor-insert-table",
    "editor-insert-reference",
  ];
  for (const testId of desktop) {
    assert.match(editor, new RegExp(`(testId|data-testid)="${testId}"`), `${testId} is a command of the computer bar`);
    const onPhone = phoneEquivalent[testId] ?? testId;
    assert.ok(bar.includes(`"${onPhone}"`), `${testId} is reached on a phone as ${onPhone}`);
  }
  for (const level of ["p", "h2", "h3", "quote"]) assert.match(editor, new RegExp(`type: "${level}"`));
  assert.equal((editor.match(/photo=\{\s*<PhotoSheetButton/g) ?? []).length, 2, "the photo choices on both editors");
  assert.doesNotMatch(bar, /Chevron/);
});
