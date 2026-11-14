// @vitest-environment jsdom
import assert from "node:assert/strict";
import { EditorContent, useEditor } from "@tiptap/react";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { test, vi } from "vitest";

vi.mock("../src/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (key) => key }) }));

import { editorExtensions } from "../src/components/editor/extensions.ts";
import { ResourceImagePresentationProvider } from "../src/components/editor/images.tsx";
import { insertImage } from "../src/components/editor/imageTransfer.tsx";
import { reducePhotoOfForm } from "../src/features/documents/photoReduction.ts";

/** A decoder of a 4000 × 3000 photo, as the browser decodes it before the reduction. */
const decode = async () => ({
  width: 4000,
  height: 3000,
  draw: () => ({ opaque: () => true, jpeg: async () => new Blob([new Uint8Array(10)], { type: "image/jpeg" }) }),
  close: () => undefined,
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

async function mountEditor() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let editor = null;
  function Writing() {
    editor = useEditor({ extensions: editorExtensions({}), content: "<p>Avant la photo</p>" });
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
  return {
    host,
    editor,
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

/** Sends the photo as the stores do: the reduction decodes the file of the form before the request. */
function sendingUpload(request) {
  return async (file) => {
    const form = new FormData();
    form.set("file", file);
    await reducePhotoOfForm(form, decode);
    return request.promise;
  };
}

const photo = () => new File([new Uint8Array(600_000)], "photo.jpg", { type: "image/jpeg" });

// @verifies-requirement HALL-FR-LAY-010
test("a chosen photo shows a low place with the loading indicator in the text while it is sent, then the image takes that place", async () => {
  const { host, editor, unmount } = await mountEditor();
  const request = deferred();
  const statuses = [];
  const end = editor.state.doc.content.size - 1;
  await act(async () =>
    insertImage(editor.view, photo(), end, sendingUpload(request), (status) => statuses.push(status)),
  );
  await settle();

  const placeholder = host.querySelector('.ProseMirror [data-testid="editor-image-placeholder"]');
  assert.ok(placeholder, "the place of the image shows as soon as the photo is chosen");
  assert.equal(placeholder.style.aspectRatio, "", "the place does not take the proportions of the photo");
  assert.ok(placeholder.querySelector('[data-testid="loading-indicator"]'), "the place carries the loading indicator");
  assert.equal(editor.getJSON().content.length, 1, "the place is not part of the text");

  await act(async () => editor.commands.insertContentAt(1, "Texte écrit pendant l’envoi. "));
  assert.match(editor.getText(), /^Texte écrit pendant l’envoi\. Avant la photo/);

  await act(async () => request.resolve({ id: "photo-1", label: "Photo" }));
  await settle();
  assert.equal(host.querySelector('.ProseMirror > p [data-testid="editor-image-placeholder"]'), null);
  assert.deepEqual(
    editor
      .getJSON()
      .content.slice(0, 2)
      .map((node) => node.type),
    ["paragraph", "resourceImage"],
    "the image is placed after the paragraph where the photo was chosen",
  );
  const figure = host.querySelector('.editor-image-node [data-testid="editor-image-placeholder"]');
  assert.ok(figure, "the placed image keeps the low place until its address is known");
  assert.equal(figure.style.aspectRatio, "");
  assert.deepEqual(statuses.at(-1), { kind: "idle" });
  await unmount();
});

// @verifies-requirement HALL-FR-LAY-010
test("the place of a photo whose sending fails disappears and the failure is said under the text", async () => {
  const { host, editor, unmount } = await mountEditor();
  const request = deferred();
  const statuses = [];
  await act(async () =>
    insertImage(editor.view, photo(), editor.state.doc.content.size - 1, sendingUpload(request), (status) =>
      statuses.push(status),
    ),
  );
  await settle();
  assert.ok(host.querySelector('[data-testid="editor-image-placeholder"]'));
  await act(async () => request.reject(new Error("network")));
  await settle();
  assert.equal(host.querySelector('[data-testid="editor-image-placeholder"]'), null);
  assert.deepEqual(statuses.at(-1), { kind: "failed" });
  assert.equal(editor.getText(), "Avant la photo");
  await unmount();
});
