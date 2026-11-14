// @vitest-environment jsdom
import assert from "node:assert/strict";
import { EditorContent, useEditor } from "@tiptap/react";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { test, vi } from "vitest";

vi.mock("../src/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (key) => key }) }));

import { editorExtensions } from "../src/components/editor/extensions.ts";
import { ResourceImagePresentationProvider } from "../src/components/editor/images.tsx";

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

async function mountImage(phone) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: phone,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let editor = null;
  function Writing() {
    editor = useEditor({
      extensions: editorExtensions({ imageControls: true }),
      content: {
        type: "doc",
        content: [{ type: "resourceImage", attrs: { id: "photo-1", alt: "Photo", align: "left", width: 100 } }],
      },
    });
    return h(EditorContent, { editor });
  }
  await act(async () => {
    root.render(
      h(
        ResourceImagePresentationProvider,
        { resolveContentHref: () => new Promise(() => undefined), renderResourcePreview: () => null },
        h(Writing),
      ),
    );
  });
  await settle();
  await act(async () => editor.commands.setNodeSelection(0));
  await settle();
  return {
    host,
    editor,
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

// @verifies-requirement HALL-FR-LAY-010
test("on a phone, the width of an image is chosen among small, medium and full width, without the resize handle", async () => {
  const { host, editor, unmount } = await mountImage(true);
  assert.equal(host.querySelector('[data-testid="editor-image-width"]'), null, "no handle to drag on a phone");
  const trigger = host.querySelector('[data-testid="editor-image-width-menu"]');
  assert.ok(trigger, "the commands of the image offer its width");
  await act(async () => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  await settle();
  const choices = ["small", "medium", "full"].map((size) =>
    document.querySelector(`[data-testid="editor-image-width-${size}"]`),
  );
  assert.ok(choices.every(Boolean), "three widths are offered");
  assert.deepEqual(
    choices.map((choice) => choice.textContent),
    ["editor.imageWidthSmall", "editor.imageWidthMedium", "editor.imageWidthFull"],
  );
  await act(async () => choices[0].click());
  await settle();
  assert.equal(editor.state.doc.firstChild.attrs.width, 33);
  await unmount();
});

test("on a computer, the image keeps its resize handle and offers no width menu", async () => {
  const { host, unmount } = await mountImage(false);
  assert.ok(host.querySelector('[data-testid="editor-image-width"]'));
  assert.equal(host.querySelector('[data-testid="editor-image-width-menu"]'), null);
  await unmount();
});
