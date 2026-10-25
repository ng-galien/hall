import { readFile } from "node:fs/promises";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { objectLinks } from "../api/sirenRepresentation.js";
import { createMarkdownDocumentPreviewConverter } from "../infrastructure/documents/markdownDocumentPreviewConverter.js";
import { createServiceTestServer, domainBody } from "./testServer.js";

const fixture = new URL("./fixtures/document-preview.docx", import.meta.url);

describe("local DOCX Markdown preview", () => {
  it("converts legal text, lists, tables and raster images while preserving the original", async () => {
    const original = await readFile(fixture);
    const { agent } = await createServiceTestServer({
      documentPreviewConverter: createMarkdownDocumentPreviewConverter(),
    });
    const response = await agent
      .post("/api/resources/documents")
      .field("path", "seed")
      .attach("file", original, { filename: "deliberation.docx" })
      .expect(201);
    const resource = domainBody<{ id: string }>(response);
    const links = objectLinks({ path: `/api/resources/${resource.id}` } as Request, "resource", {
      id: resource.id,
      kind: "document",
      format: "docx",
      mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(links.find((link) => link.rel.includes("preview"))?.type).toBe("text/markdown; charset=utf-8");
    await agent
      .patch(`/api/resources/${resource.id}/location`)
      .send({ path: "seed", name: "Délibération sans extension" })
      .expect(200);
    const preview = await agent.get(`/api/resources/${resource.id}/preview`).expect(200);
    expect(preview.headers["content-type"]).toContain("text/markdown");
    expect(preview.text).toContain("# Délibération du conseil");
    expect(preview.text).toContain("13 juillet 2026");
    expect(preview.text).toMatch(/-\s+Autoriser la dépense/);
    expect(preview.text).toContain("<table>");
    expect(preview.text).toContain("123,45 €");
    expect(preview.text).toContain("data:image/png;base64,");
    expect(preview.text).not.toContain("javascript:");
    expect(preview.text).toContain("Lien non fiable");
    const downloaded = await agent
      .get(`/api/resources/${resource.id}/content`)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(Buffer.compare(downloaded.body, original)).toBe(0);
    expect(await readFile(fixture)).toEqual(original);
  });

  it("omits active image content disguised as a PNG", async () => {
    const content = await readFile(new URL("./fixtures/document-preview-disguised-image.docx", import.meta.url));
    const markdown = (
      await createMarkdownDocumentPreviewConverter().convertToMarkdown({
        fileName: "document.docx",
        mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        content,
      })
    ).toString("utf8");
    expect(markdown).toContain("Délibération du conseil");
    expect(markdown).not.toContain("data:image");
    expect(markdown).not.toContain("<script");
    expect(markdown).not.toContain("javascript:");
  });

  it("rejects malformed DOCX archives", async () => {
    await expect(
      createMarkdownDocumentPreviewConverter().convertToMarkdown({
        fileName: "broken.docx",
        mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        content: Buffer.from("broken"),
      }),
    ).rejects.toThrow("Document preview conversion failed");
  });
});
