export interface DocumentPreviewConversionInput {
  fileName: string;
  mediaType: string;
  content: Buffer;
}

export interface DocumentPreviewConverter {
  convertToMarkdown(input: DocumentPreviewConversionInput): Promise<Buffer>;
}

export class DocumentPreviewConverterFailedError extends Error {
  constructor() {
    super("Document preview conversion failed");
    this.name = "DocumentPreviewConverterFailedError";
  }
}
