import { createHash, randomUUID } from "node:crypto";
import type { Response } from "superagent";
import { describe, expect, it } from "vitest";
import { DocumentPreviewConverterFailedError } from "../services/documentPreviewConverter.js";
import { createTestServer, domainBody } from "./testServer.js";

function storedZip(entries: Array<[name: string, content: string]>): Buffer {
  const localEntries: Buffer[] = [];
  const centralEntries: Buffer[] = [];
  let localOffset = 0;
  for (const [name, value] of entries) {
    const nameBytes = Buffer.from(name);
    const content = Buffer.from(value);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    const localEntry = Buffer.concat([localHeader, nameBytes, content]);
    localEntries.push(localEntry);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralEntries.push(Buffer.concat([centralHeader, nameBytes]));
    localOffset += localEntry.length;
  }
  const centralDirectory = Buffer.concat(centralEntries);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localEntries, centralDirectory, end]);
}

const docx = storedZip([
  [
    "[Content_Types].xml",
    '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  ],
  ["word/document.xml", "<document/>"],
]);

const binaryParser = (response: Response, callback: (error: Error | null, body: Buffer) => void): void => {
  const chunks: Buffer[] = [];
  response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  response.on("end", () => callback(null, Buffer.concat(chunks)));
  response.on("error", (error) => callback(error, Buffer.alloc(0)));
};

async function uploadDocx(agent: Awaited<ReturnType<typeof createTestServer>>["agent"], title: string) {
  return agent
    .post("/api/resources/documents")
    .field("title", title)
    .attach("file", docx, {
      filename: `${title}.docx`,
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    })
    .expect(201);
}

describe("derived document previews", () => {
  it("rejects missing, non-document, native and malformed derived previews at the service boundary", async () => {
    const { agent, container } = await createTestServer({
      documentPreviewConverter: {
        async convertToPdf() {
          return Buffer.from("not a PDF");
        },
      },
    });

    await expect(container.cradle.documentPreviewService.get(randomUUID())).rejects.toMatchObject({
      code: "resource_not_found",
      statusCode: 404,
    });
    const text = domainBody<{ id: string }>(
      await agent
        .post("/api/resources/texts")
        .send({ title: "Note", folderPath: "seed", tags: [], content: "Note" })
        .expect(201),
    );
    await expect(container.cradle.documentPreviewService.get(text.id)).rejects.toMatchObject({
      code: "resource_preview_unavailable",
      statusCode: 409,
    });

    const nativePdf = domainBody<{ id: string }>(
      await agent
        .post("/api/resources/documents")
        .field("title", "PDF natif")
        .attach("file", Buffer.from("%PDF-1.7\nnative"), { filename: "native.pdf", contentType: "application/pdf" })
        .expect(201),
    );
    await expect(container.cradle.documentPreviewService.get(nativePdf.id)).rejects.toMatchObject({
      code: "resource_preview_unavailable",
      statusCode: 409,
    });

    const convertible = domainBody<{ id: string }>(await uploadDocx(agent, "Malformed derived preview"));
    await expect(container.cradle.documentPreviewService.get(convertible.id)).rejects.toMatchObject({
      code: "resource_preview_conversion_failed",
      statusCode: 502,
    });
  });

  it("coalesces concurrent conversion requests for the same original", async () => {
    let conversions = 0;
    let releaseConversion: (() => void) | undefined;
    const conversionStarted = new Promise<void>((resolve) => {
      releaseConversion = resolve;
    });
    let allowCompletion: (() => void) | undefined;
    const completion = new Promise<void>((resolve) => {
      allowCompletion = resolve;
    });
    const { agent, container } = await createTestServer({
      documentPreviewConverter: {
        async convertToPdf() {
          conversions += 1;
          releaseConversion?.();
          await completion;
          return Buffer.from("%PDF-1.7\ncoalesced");
        },
      },
    });
    const document = domainBody<{ id: string }>(await uploadDocx(agent, "Concurrent"));

    const first = container.cradle.documentPreviewService.get(document.id);
    await conversionStarted;
    const second = container.cradle.documentPreviewService.get(document.id);
    allowCompletion?.();

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(conversions).toBe(1);
  });

  it("keeps the original authoritative and reuses one PDF by source SHA-256", async () => {
    const pdf = Buffer.from("%PDF-1.7\nderived preview");
    let conversions = 0;
    const { agent, container } = await createTestServer({
      documentPreviewConverter: {
        async convertToPdf() {
          conversions += 1;
          return pdf;
        },
      },
    });
    const first = await uploadDocx(agent, "Convention A");
    const second = await uploadDocx(agent, "Convention B");
    const firstDocument = domainBody<{ slug: string; contentSha256: string; mediaType: string }>(first);
    const secondDocument = domainBody<{ slug: string }>(second);

    expect(first.body.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rel: ["preview"],
          href: `/api/resources/${firstDocument.slug}/preview`,
          type: "application/pdf",
        }),
      ]),
    );
    const original = await agent
      .get(`/api/resources/${firstDocument.slug}/content`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    expect(original.headers["content-type"]).toBe(firstDocument.mediaType);
    expect(original.headers.etag).toBe(`"${firstDocument.contentSha256}"`);
    expect(original.body).toEqual(docx);

    const firstPreview = await agent.get(`/api/resources/${firstDocument.slug}/preview`).expect(200);
    const secondPreview = await agent.get(`/api/resources/${secondDocument.slug}/preview`).expect(200);
    expect(firstPreview.headers["content-type"]).toBe("application/pdf");
    expect(firstPreview.headers.etag).toBe(`"${createHash("sha256").update(pdf).digest("hex")}"`);
    expect(Buffer.from(firstPreview.body)).toEqual(pdf);
    expect(Buffer.from(secondPreview.body)).toEqual(pdf);
    expect(conversions).toBe(1);

    await agent.delete(`/api/resources/${firstDocument.slug}`).expect(204);
    expect(await container.cradle.resourceRepository.findPreview(firstDocument.contentSha256, "docx")).not.toBeNull();
    await agent.delete(`/api/resources/${secondDocument.slug}`).expect(204);
    expect(await container.cradle.resourceRepository.findPreview(firstDocument.contentSha256, "docx")).toBeNull();
  });

  it("reports a conversion failure and retries on the next request", async () => {
    let fail = true;
    let conversions = 0;
    const { agent } = await createTestServer({
      documentPreviewConverter: {
        async convertToPdf() {
          conversions += 1;
          if (fail) throw new DocumentPreviewConverterFailedError(500);
          return Buffer.from("%PDF-1.7\nretry succeeded");
        },
      },
    });
    const document = domainBody<{ slug: string }>(await uploadDocx(agent, "Retry"));
    const failed = await agent.get(`/api/resources/${document.slug}/preview`).expect(502);
    expect(domainBody(failed)).toMatchObject({ code: "resource_preview_conversion_failed", status: 502 });

    fail = false;
    await agent.get(`/api/resources/${document.slug}/preview`).expect(200);
    expect(conversions).toBe(2);
    await agent.get(`/api/resources/${document.slug}/content`).expect(200);
  });

  it("reports an unconfigured converter without hiding the original", async () => {
    const { agent } = await createTestServer();
    const document = domainBody<{ slug: string }>(await uploadDocx(agent, "Unavailable"));
    const failed = await agent.get(`/api/resources/${document.slug}/preview`).expect(503);
    expect(domainBody(failed)).toMatchObject({
      code: "resource_preview_conversion_unavailable",
      status: 503,
    });
    await agent.get(`/api/resources/${document.slug}/content`).expect(200);
  });
});
