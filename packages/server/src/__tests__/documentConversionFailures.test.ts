import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { createTestServer, domainBody } from "./testServer.js";

it("preserves the original document when preview conversion fails and accepts a later successful preview", async () => {
  let failing = true;
  const { rawAgent } = await createTestServer({
    documentPreviewConverter: {
      convertToMarkdown: async () => {
        if (failing) throw new Error("Converter unavailable");
        return Buffer.from("# Aperçu récupéré");
      },
    },
  });
  const original = await readFile(new URL("./fixtures/document-preview.docx", import.meta.url));
  const document = domainBody(
    await rawAgent.post("/api/resources/documents").attach("file", original, "rapport.docx").expect(201),
  );
  const url = `/api/resources/${document.id}`;
  const failure = await rawAgent.get(`${url}/preview`).expect(502);
  expect(failure.body.code).toBe("resource_preview_conversion_failed");
  const preserved = domainBody(await rawAgent.get(url).expect(200));
  expect(preserved.binary).toEqual(document.binary);
  failing = false;
  const preview = await rawAgent.get(`${url}/preview`).expect(200);
  expect(preview.headers["content-type"]).toContain("text/markdown");
  expect(preview.text).toBe("# Aperçu récupéré");
  expect(domainBody(await rawAgent.get(url).expect(200)).binary).toEqual(document.binary);
  const missing = "00000000-0000-4000-8000-000000000099";
  await rawAgent.get(`/api/resources/${missing}/preview`).expect(404);
  await rawAgent.put(`/api/resources/${missing}/binary`).attach("file", original, "rapport.docx").expect(404);
  const text = domainBody(
    await rawAgent
      .post("/api/resources")
      .send({ kind: "text", path: "", name: "Texte", content: "Initial" })
      .expect(201),
  );
  await rawAgent.get(`/api/resources/${text.id}/preview`).expect(409);
  await rawAgent.put(`/api/resources/${text.id}/binary`).attach("file", original, "rapport.docx").expect(400);
  expect(domainBody(await rawAgent.get(`/api/resources/${text.id}`).expect(200)).content).toBe("Initial");
});

// @verifies-requirement HALL-FR-DOC-510
it("converts a spreadsheet through the advertised HTTP action without creating a resource", async () => {
  const { rawAgent } = await createTestServer();
  const before = await rawAgent.get("/api/resources").expect(200);
  expect(before.body.actions).toContainEqual(expect.objectContaining({ name: "resource.convert-spreadsheet-table" }));
  const converted = await rawAgent
    .post("/api/resources/spreadsheets/table")
    .attach("file", Buffer.from("Poste;Montant\nVoirie;125\n"), "budget.csv")
    .expect(200);
  expect(domainBody(converted)).toEqual({
    markdown: "| Poste | Montant |\n| --- | --- |\n| Voirie | 125 |",
    rowCount: 1,
    includedRowCount: 1,
  });
  const after = await rawAgent.get("/api/resources").expect(200);
  expect(after.body.entities).toEqual(before.body.entities);
});
