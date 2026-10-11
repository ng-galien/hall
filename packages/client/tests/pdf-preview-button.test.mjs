// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, test, vi } from "vitest";
import { PdfPreviewButton } from "../src/features/documents/PdfPreviewButton.tsx";
import { previewTemplatePdf } from "../src/services/templatesApi.ts";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.mock("../src/services/templatesApi.ts", () => ({ previewTemplatePdf: vi.fn() }));
vi.mock("../src/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (key) => key }) }));
vi.mock("../src/components/icons", () => ({ PdfIcon: () => null }));
vi.mock("../src/components/ui/button", () => ({
  Button: ({ children, ...props }) => h("button", { type: "button", ...props }, children),
}));
vi.mock("../src/components/ui/dialog", () => ({
  Dialog: ({ children, open, onOpenChange }) =>
    h(
      "div",
      {},
      open
        ? h("button", { type: "button", "data-testid": "close-preview", onClick: () => onOpenChange(false) }, "Close")
        : null,
      children,
    ),
  DialogContent: ({ children, ...props }) => h("div", props, children),
  DialogHeader: ({ children }) => h("div", {}, children),
  DialogTitle: ({ children }) => h("h2", {}, children),
}));
vi.mock("../src/features/documents/NativeDocumentFrame", () => ({
  NativeDocumentFrame: ({ url, mediaType }) => h("iframe", { src: url, "data-media-type": mediaType }),
}));

const hosts = [];
afterEach(async () => {
  for (const { root, host } of hosts.splice(0)) {
    await act(async () => root.unmount());
    host.remove();
  }
  vi.mocked(previewTemplatePdf).mockReset();
});

function mount(testId = "business-report-pdf-preview", viewerTestId) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  hosts.push({ root, host });
  return {
    host,
    render: (markdown, key = "business-a") =>
      act(async () => root.render(h(PdfPreviewButton, { key, markdown, testId, viewerTestId }))),
  };
}

test("Editor Lab PDF viewer keeps its established Playwright selector", async () => {
  vi.mocked(previewTemplatePdf).mockResolvedValue("/api/templates/preview-pdf/current");
  const { host, render } = mount("editor-pdf-preview", "editor-pdf-native-viewer");
  await render("Lab document");
  await act(async () => host.querySelector('[data-testid="editor-pdf-preview"]').click());
  assert.equal(
    host.querySelector('[data-testid="editor-pdf-native-viewer"] iframe')?.getAttribute("src"),
    "/api/templates/preview-pdf/current",
  );
});

// @verifies-requirement HALL-FR-WSP-370
test("PDF preview uses current unsaved Markdown, then closes without changing it", async () => {
  let complete;
  vi.mocked(previewTemplatePdf).mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  const { host, render } = mount();
  await render("Ancien rapport");
  await render("Rapport corrigé mais non enregistré");
  const button = host.querySelector('[data-testid="business-report-pdf-preview"]');
  await act(async () => button.click());
  assert.deepEqual(vi.mocked(previewTemplatePdf).mock.calls, [["Rapport corrigé mais non enregistré"]]);
  assert.equal(button.disabled, true);
  assert.match(button.textContent, /Loading/);
  assert.equal(host.querySelector("iframe"), null);
  await act(async () => complete("/api/templates/preview-pdf/current"));
  assert.equal(host.querySelector("iframe")?.getAttribute("src"), "/api/templates/preview-pdf/current");
  assert.equal(host.querySelector("iframe")?.getAttribute("data-media-type"), "application/pdf");
  await act(async () => host.querySelector('[data-testid="close-preview"]').click());
  assert.equal(host.querySelector("iframe"), null);
  assert.equal(button.disabled, false);
});

// @verifies-requirement HALL-FR-WSP-370
test("PDF preview reports failure and ignores a response after changing affairs", async () => {
  vi.mocked(previewTemplatePdf).mockRejectedValueOnce(new Error("Preview failed"));
  let complete;
  vi.mocked(previewTemplatePdf).mockReturnValueOnce(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  const { host, render } = mount();
  await render("Affaire A");
  await act(async () => host.querySelector('[data-testid="business-report-pdf-preview"]').click());
  assert.equal(host.querySelector('[role="alert"]')?.textContent, "editor.pdfPreviewFailed");
  await act(async () => host.querySelector('[data-testid="business-report-pdf-preview"]').click());
  await render("Affaire B", "business-b");
  await act(async () => complete("/api/templates/preview-pdf/old"));
  assert.equal(host.querySelector("iframe"), null);
  assert.equal(host.querySelector('[role="alert"]'), null);
});
