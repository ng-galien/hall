// @vitest-environment jsdom
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { test, vi } from "vitest";

vi.mock("../src/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (key) => key }) }));
vi.mock("../src/shell/usePhoneLayout", () => ({ usePhoneDocumentPages: () => true, usePhoneLayout: () => true }));
vi.mock("../src/shell/phoneHistory", () => ({ usePhoneViewerHistory: (_phone, close) => close }));

import { EditorImageViewer } from "../src/features/documents/EditorImageViewer.tsx";

const app = readFileSync(join(import.meta.dirname, "..", "src", "App.tsx"), "utf8");

// @verifies-requirement HALL-FR-DOC-480
test("the name of an image of a text opens the image itself, not the preview of a workspace resource", () => {
  const renderer = /<ResourceImagePresentationProvider[^]*?renderResourcePreview=\{(.*)\}\n/.exec(app)?.[1] ?? "";
  assert.match(renderer, /<EditorImageViewer /);
  assert.doesNotMatch(renderer, /ResourcePreview\b|^renderResourcePreview$/);
});

// @verifies-requirement HALL-FR-DOC-480
test("the image viewer shows the image of the text and closes back to the text", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let closed = 0;
  await act(async () => {
    root.render(h(EditorImageViewer, { id: "asset-1", label: "Balance du tacot", onClose: () => (closed += 1) }));
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  const image = document.querySelector('[data-testid="editor-image-viewer-image"]');
  assert.ok(image, "the image is shown");
  assert.equal(image.getAttribute("src"), "/api/resources/binary-references/asset-1/content");
  assert.equal(image.getAttribute("alt"), "Balance du tacot");
  await act(async () => document.querySelector('[data-testid="editor-image-viewer-close"]').click());
  assert.equal(closed, 1);
  await act(async () => root.unmount());
  host.remove();
});
