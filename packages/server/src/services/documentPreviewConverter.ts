export interface DocumentPreviewConversionInput {
  fileName: string;
  mediaType: string;
  content: Buffer;
}

export interface DocumentPreviewConverter {
  convertToPdf(input: DocumentPreviewConversionInput): Promise<Buffer>;
}

export class DocumentPreviewConverterUnavailableError extends Error {
  constructor() {
    super("Document preview conversion is not configured");
    this.name = "DocumentPreviewConverterUnavailableError";
  }
}

export class DocumentPreviewConverterFailedError extends Error {
  constructor(readonly upstreamStatus?: number) {
    super("Document preview conversion failed");
    this.name = "DocumentPreviewConverterFailedError";
  }
}
