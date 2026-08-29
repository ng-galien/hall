import { afterEach, describe, expect, it, vi } from "vitest";
import { createGotenbergDocumentPreviewConverter } from "../infrastructure/documents/gotenbergDocumentPreviewConverter.js";
import {
  DocumentPreviewConverterFailedError,
  DocumentPreviewConverterUnavailableError,
} from "../services/documentPreviewConverter.js";

const input = {
  fileName: "private.docx",
  mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  content: Buffer.from("private original"),
};

afterEach(() => vi.unstubAllGlobals());

describe("Gotenberg document preview adapter", () => {
  it("fails explicitly when the internal converter is not configured", async () => {
    const converter = createGotenbergDocumentPreviewConverter({
      config: { host: "127.0.0.1", port: 0, database: { kind: "sqlite", path: ":memory:" } },
    });
    await expect(converter.convertToPdf(input)).rejects.toBeInstanceOf(DocumentPreviewConverterUnavailableError);
  });

  it("posts the original as multipart data to the LibreOffice conversion route", async () => {
    const pdf = Buffer.from("%PDF-1.7\nconverted");
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      const form = init?.body;
      expect(form).toBeInstanceOf(FormData);
      const file = (form as FormData).get("files");
      expect(file).toBeInstanceOf(File);
      expect((file as File).name).toBe(input.fileName);
      expect(Buffer.from(await (file as File).arrayBuffer())).toEqual(input.content);
      return new Response(pdf, { status: 200, headers: { "Content-Type": "application/pdf" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const converter = createGotenbergDocumentPreviewConverter({
      config: {
        host: "127.0.0.1",
        port: 0,
        database: { kind: "sqlite", path: ":memory:" },
        documentPreviewConverterUrl: "http://gotenberg.internal:3000",
      },
    });

    await expect(converter.convertToPdf(input)).resolves.toEqual(pdf);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("http://gotenberg.internal:3000/forms/libreoffice/convert"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses the loopback Gotenberg service by default in development", async () => {
    const fetchMock = vi.fn(async () => new Response("%PDF-1.7\ndevelopment", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const converter = createGotenbergDocumentPreviewConverter({
      config: {
        host: "127.0.0.1",
        port: 0,
        database: { kind: "sqlite", path: ":memory:" },
        environment: "development",
      },
    });

    await converter.convertToPdf(input);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("http://127.0.0.1:3001/forms/libreoffice/convert"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("converts CSV through a safe tabular HTML document", async () => {
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      if (!(init?.body instanceof FormData)) throw new Error("Expected multipart form data");
      const file = init.body.get("files") as File;
      expect(file.name).toBe("private.html");
      expect(file.type).toBe("text/html; charset=utf-8");
      const html = await file.text();
      expect(html).toContain("<thead><tr><th>name</th><th>amount</th></tr></thead>");
      expect(html).toContain("<td>Club &amp; loisirs</td>");
      return new Response("%PDF-1.7\ncsv", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const converter = createGotenbergDocumentPreviewConverter({
      config: {
        host: "127.0.0.1",
        port: 0,
        database: { kind: "sqlite", path: ":memory:" },
        documentPreviewConverterUrl: "http://gotenberg.internal:3000",
      },
    });

    await converter.convertToPdf({
      fileName: "private.csv",
      mediaType: "text/csv; charset=utf-8",
      content: Buffer.from('name;amount\n"Club & loisirs";4800\n'),
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("maps an upstream rejection to a stable adapter error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("rejected", { status: 400 })),
    );
    const converter = createGotenbergDocumentPreviewConverter({
      config: {
        host: "127.0.0.1",
        port: 0,
        database: { kind: "sqlite", path: ":memory:" },
        documentPreviewConverterUrl: "http://gotenberg.internal:3000",
      },
    });
    await expect(converter.convertToPdf(input)).rejects.toMatchObject({
      constructor: DocumentPreviewConverterFailedError,
      upstreamStatus: 400,
    });
  });
});
