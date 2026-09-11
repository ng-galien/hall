import { describe, expect, it, vi } from "vitest";
import { createTestServer, domainBody } from "./testServer.js";

describe("plain text document preview", () => {
  it("returns the original UTF-8 text without invoking document conversion", async () => {
    const convertToMarkdown = vi.fn().mockRejectedValue(new Error("Converter unavailable"));
    const { agent } = await createTestServer({ documentPreviewConverter: { convertToMarkdown } });
    const text = "Réunion du conseil\n\nTexte <sans HTML> et accents : été.";
    const resource = domainBody<{ id: string }>(
      await agent
        .post("/api/resources/documents")
        .field("path", "seed")
        .attach("file", Buffer.from(text), { filename: "note.txt", contentType: "text/plain" })
        .expect(201),
    );
    await agent
      .patch(`/api/resources/${resource.id}/location`)
      .send({ path: "seed", name: "Délibération sans extension" })
      .expect(200);
    const response = await agent.get(`/api/resources/${resource.id}/preview`).expect(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.text).toBe(text);
    expect(convertToMarkdown).not.toHaveBeenCalled();
  });
  it("keeps a renamed PDF native without invoking document conversion", async () => {
    const convertToMarkdown = vi.fn().mockRejectedValue(new Error("Must remain native"));
    const { agent } = await createTestServer({ documentPreviewConverter: { convertToMarkdown } });
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF");
    const resource = domainBody<{ id: string }>(
      await agent
        .post("/api/resources/documents")
        .field("path", "seed")
        .attach("file", pdf, { filename: "acte.pdf" })
        .expect(201),
    );
    await agent
      .patch(`/api/resources/${resource.id}/location`)
      .send({ path: "seed", name: "Acte sans extension" })
      .expect(200);
    const response = await agent.get(`/api/resources/${resource.id}/preview`).expect(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.body).toEqual(pdf);
    expect(convertToMarkdown).not.toHaveBeenCalled();
  });
});
