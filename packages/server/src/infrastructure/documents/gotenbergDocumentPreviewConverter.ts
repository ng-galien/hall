import type { ServerConfig } from "../../core/config.js";
import {
  type DocumentPreviewConverter,
  DocumentPreviewConverterFailedError,
  DocumentPreviewConverterUnavailableError,
} from "../../services/documentPreviewConverter.js";
import { csvAsHtmlDocument } from "./csvDocumentPreview.js";

const maxPreviewBytes = 100 * 1024 * 1024;

export function createGotenbergDocumentPreviewConverter({
  config,
}: {
  config: ServerConfig;
}): DocumentPreviewConverter {
  const converterUrl =
    config.documentPreviewConverterUrl ?? (config.environment === "development" ? "http://127.0.0.1:3001" : undefined);
  return {
    async convertToPdf(input) {
      if (!converterUrl) throw new DocumentPreviewConverterUnavailableError();
      const conversionInput = input.fileName.toLowerCase().endsWith(".csv") ? csvAsHtmlDocument(input) : input;
      const form = new FormData();
      form.append(
        "files",
        new Blob([Uint8Array.from(conversionInput.content)], { type: conversionInput.mediaType }),
        conversionInput.fileName,
      );
      let response: Response;
      try {
        response = await fetch(
          new URL("forms/libreoffice/convert", converterUrl.endsWith("/") ? converterUrl : `${converterUrl}/`),
          {
            method: "POST",
            body: form,
            signal: AbortSignal.timeout(config.documentPreviewTimeoutMs ?? 30_000),
          },
        );
      } catch {
        throw new DocumentPreviewConverterFailedError();
      }
      if (!response.ok) throw new DocumentPreviewConverterFailedError(response.status);
      const declaredLength = Number.parseInt(response.headers.get("content-length") ?? "0", 10);
      if (declaredLength > maxPreviewBytes) throw new DocumentPreviewConverterFailedError();
      const content = Buffer.from(await response.arrayBuffer());
      if (content.byteLength > maxPreviewBytes) throw new DocumentPreviewConverterFailedError();
      return content;
    },
  };
}
