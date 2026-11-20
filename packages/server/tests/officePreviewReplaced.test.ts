import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { createTestServer, domainBody } from "../src/__tests__/testServer.js";

// @verifies-requirement HALL-FR-DOC-480
it("the preview of a replaced Word file shows its new content, not the conversion kept for the former file", async () => {
  const conversions: number[] = [];
  const { rawAgent } = await createTestServer({
    documentPreviewConverter: {
      convertToMarkdown: async (input) => {
        conversions.push(input.content.byteLength);
        return Buffer.from(`# Version de ${input.content.byteLength} octets`);
      },
    },
  });
  const original = await readFile(new URL("../src/__tests__/fixtures/document-preview.docx", import.meta.url));
  const replacement = Buffer.concat([original, Buffer.from("remplacement")]);
  const document = domainBody(
    await rawAgent.post("/api/resources/documents").attach("file", original, "rapport.docx").expect(201),
  );
  const url = `/api/resources/${document.id}`;
  expect((await rawAgent.get(`${url}/preview`).expect(200)).text).toBe(`# Version de ${original.byteLength} octets`);
  expect((await rawAgent.get(`${url}/preview`).expect(200)).text).toBe(`# Version de ${original.byteLength} octets`);
  expect(conversions, "the second showing reuses the conversion").toEqual([original.byteLength]);
  await rawAgent.put(`${url}/binary`).attach("file", replacement, "rapport.docx").expect(200);
  expect((await rawAgent.get(`${url}/preview`).expect(200)).text).toBe(`# Version de ${replacement.byteLength} octets`);
  expect(conversions).toEqual([original.byteLength, replacement.byteLength]);
});
