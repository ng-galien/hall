import assert from "node:assert/strict";
import { test } from "vitest";
import { pdfViewerUrl } from "../src/features/documents/NativeDocumentFrame.tsx";

// @verifies-requirement HALL-FR-DOC-480
test("a PDF opens in the browser viewer with its page sidebar closed, for a server address and a blob alike", () => {
  assert.equal(pdfViewerUrl("/api/resources/a/content.pdf"), "/api/resources/a/content.pdf#navpanes=0&pagemode=none");
  assert.equal(pdfViewerUrl("blob:http://127.0.0.1/1f2e"), "blob:http://127.0.0.1/1f2e#navpanes=0&pagemode=none");
});

// @verifies-requirement HALL-FR-DOC-480
test("the parameters already in the fragment of a PDF address are kept and never repeated", () => {
  assert.equal(pdfViewerUrl("/document.pdf#page=3"), "/document.pdf#page=3&navpanes=0&pagemode=none");
  assert.equal(pdfViewerUrl("/document.pdf#navpanes=1"), "/document.pdf#navpanes=1&pagemode=none");
  const once = pdfViewerUrl("/document.pdf");
  assert.equal(pdfViewerUrl(once), once);
});
