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

// @verifies-requirement HALL-FR-LAY-130
test("after a photo the writing goes on below it: the next words never replace the photo", async () => {
  const { editor, unmount } = await mountEditor();
  const request = deferred();
  await act(async () =>
    insertImage(editor.view, photo(), editor.state.doc.content.size - 1, sendingUpload(request), () => undefined),
  );
  await settle();
  await act(async () => request.resolve({ id: "photo-1", label: "Photo" }));
  await settle();
  assert.equal(editor.state.selection.empty, true, "the photo is not left selected");
  await act(async () => editor.commands.insertContent("Suite du texte"));
  const kinds = editor.getJSON().content.map((node) => node.type);
  assert.deepEqual(kinds, ["paragraph", "resourceImage", "paragraph"]);
  assert.equal(editor.getJSON().content[2].content[0].text, "Suite du texte");
  await unmount();
});

// @verifies-requirement HALL-FR-LAY-130
test("words written while a photo is sent stay where they are written when the photo arrives", async () => {
  const { editor, unmount } = await mountEditor();
  const request = deferred();
  await act(async () =>
    insertImage(editor.view, photo(), editor.state.doc.content.size - 1, sendingUpload(request), () => undefined),
  );
  await settle();
  await act(async () => editor.chain().focus("end").insertContent(" écrit pendant l’envoi").run());
  await act(async () => request.resolve({ id: "photo-1", label: "Photo" }));
  await settle();
  await act(async () => editor.commands.insertContent(", puis la suite"));
  assert.ok(
    editor.getJSON().content.some((node) => node.type === "resourceImage"),
    "the photo is still in the text",
  );
  assert.match(editor.getText(), /écrit pendant l’envoi, puis la suite/);
  await unmount();
});
