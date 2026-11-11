import type { CouncilDecisionDetail, MeetingNoticeFacts } from "@hall/contracts";
import {
  type ContentTemplate,
  defaultDocumentTemplates,
  type GeneratedDocumentType,
  type TemplateRenderContext,
} from "@hall/domain";
import type { Diagnostic } from "@hall/templating";
import { validateJinja } from "@hall/templating/jinja";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import type { ResourcesClient } from "../clients/resourcesClient.js";
import type {
  ContentTemplateRepository,
  HallSettingsRepository,
  SaveContentTemplate,
  UnitOfWork,
} from "../repositories/contracts.js";
import type { DocumentRenderer } from "./documentRenderer.js";
import { DomainError } from "./errors.js";
import type { GeneratedTemplateData } from "./templateData.js";
import type { TemplatePreviewContext, TemplatePreviewContextService } from "./templatePreviewContextService.js";
import type { TemplatePreview, TemplateRenderingService } from "./templateRendering.js";

export interface TemplateDraft {
  documentType?: string;
  kind: ContentTemplate["kind"];
  bodyMarkdown: string;
  subject?: string | null;
  stylesheet?: string;
  headerHtml?: string;
  footerHtml?: string;
}

export interface GenerateTemplateInput {
  /** Trusted document-owned facts and files supplied by an internal use case, never from HTTP input. */
  meetingNoticeFacts?: MeetingNoticeFacts;
  councilDecision?: CouncilDecisionDetail;
  attachmentFiles?: TemplateAttachment[];
  /** Presentation data computed by the calling use case, such as an attendance sheet or a proxy form. */
  generatedData?: GeneratedTemplateData;
  context: TemplateRenderContext;
  attachmentResourceIds: string[];
  to: string[];
  cc: string[];
  bcc: string[];
}

export interface GeneratedFile {
  content: Buffer;
  fileName: string;
  mediaType: string;
}

export interface ContentTemplateService {
  list(): Promise<ContentTemplate[]>;
  find(id: string): Promise<ContentTemplate>;
  create(input: SaveContentTemplate): Promise<ContentTemplate>;
  update(id: string, input: SaveContentTemplate): Promise<ContentTemplate>;
  delete(id: string): Promise<void>;
  preview(draft: TemplateDraft, context: TemplateRenderContext): Promise<TemplatePreview>;
  previewPdfDraft(draft: TemplateDraft, context: TemplateRenderContext): Promise<Buffer>;
  previewPdf(bodyMarkdown: string, context: TemplateRenderContext, attachPdfDocuments?: boolean): Promise<Buffer>;
  generatedPreview(
    type: GeneratedDocumentType,
    bodyMarkdown: string,
    subject: string | null,
    context?: TemplateRenderContext,
    attachPdfDocuments?: boolean,
    generatedData?: GeneratedTemplateData,
    includeMessagePresentation?: boolean,
  ): Promise<TemplatePreview>;
  generatedPdf(
    type: GeneratedDocumentType,
    bodyMarkdown: string,
    context?: TemplateRenderContext,
    attachPdfDocuments?: boolean,
    generatedData?: GeneratedTemplateData,
  ): Promise<Buffer>;
  prepareMessage(
    template: ContentTemplate,
    input: GenerateTemplateInput,
  ): Promise<{ subject: string; bodyMarkdown: string; files: TemplateAttachment[] }>;
  generate(id: string, input: GenerateTemplateInput): Promise<GeneratedFile>;
  generateFromTemplate(template: ContentTemplate, input: GenerateTemplateInput): Promise<GeneratedFile>;
  /** Runs a PDF rendering in the bounded generation queue; a full queue refuses it with template_generation_busy. */
  withGenerationSlot<T>(operation: () => Promise<T>): Promise<T>;
}

const markdownExpression = (source: string): string => `{{ ${JSON.stringify(source)} | markdown }}`;

function validatedTemplate(input: SaveContentTemplate): SaveContentTemplate {
  validateTemplateFamily(input);
  try {
    for (const source of [input.bodyMarkdown, input.subject, input.stylesheet, input.headerHtml, input.footerHtml]) {
      if (source) validateJinja(source);
    }
  } catch (error) {
    throw new DomainError(
      "template_invalid",
      422,
      "template_invalid",
      error instanceof Error ? error.message : undefined,
    );
  }
  return input;
}

function validateTemplateFamily(template: Pick<ContentTemplate, "kind" | "documentType" | "bodyMarkdown">): void {
  const generatedType = defaultDocumentTemplates.find((entry) => entry.documentType === template.documentType);
  if (!generatedType) return;
  if (template.kind !== generatedType.kind) throw new DomainError("template_invalid", 422);
}

function assertRenderable(diagnostics: Diagnostic[]): void {
  if (diagnostics.some((item) => item.severity === "error")) {
    throw new DomainError("template_invalid", 422);
  }
}

function safeFileStem(value: string): string {
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return (
    normalized
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "document"
  );
}

const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export interface TemplateAttachment {
  id: string;
  fileName: string;
  mediaType: string;
  content: Buffer;
}

async function attachments(resourcesClient: ResourcesClient, resourceIds: string[]): Promise<TemplateAttachment[]> {
  const result: TemplateAttachment[] = [];
  let totalBytes = 0;
  for (const id of new Set(resourceIds)) {
    const resource = (await resourcesClient.open(id))?.data ?? null;
    if (!resource) throw new DomainError("resource_not_found", 404);
    if (resource.kind !== "document") throw new DomainError("resource_content_unavailable", 409);
    const binary = await resourcesClient.readDocumentContent(resource.id);
    if (!binary) throw new DomainError("resource_content_unavailable", 409);
    totalBytes += binary.content.byteLength;
    if (totalBytes > MAX_ATTACHMENT_BYTES) {
      throw new DomainError("template_attachments_too_large", 413);
    }
    result.push({
      id: resource.id,
      fileName: resource.name,
      mediaType: binary.mediaType,
      content: binary.content,
    });
  }
  return result;
}

export function createContentTemplateService({
  contentTemplateRepository,
  templateRenderingService,
  templatePreviewContextService,
  documentRenderer,
  resourcesClient,
  hallSettingsRepository,
  unitOfWork,
}: {
  contentTemplateRepository: ContentTemplateRepository;
  templateRenderingService: TemplateRenderingService;
  templatePreviewContextService: TemplatePreviewContextService;
  documentRenderer: DocumentRenderer;
  resourcesClient: ResourcesClient;
  hallSettingsRepository: HallSettingsRepository;
  unitOfWork: UnitOfWork;
}): ContentTemplateService {
  const maxActiveGenerations = 2;
  const maxQueuedGenerations = 4;
  let activeGenerations = 0;
  const generationWaiters: Array<() => void> = [];

  async function withGenerationSlot<T>(operation: () => Promise<T>): Promise<T> {
    if (activeGenerations < maxActiveGenerations) activeGenerations += 1;
    else {
      if (generationWaiters.length >= maxQueuedGenerations) {
        throw new DomainError("template_generation_busy", 429);
      }
      await new Promise<void>((resolve) => generationWaiters.push(resolve));
    }
    try {
      return await operation();
    } finally {
      const next = generationWaiters.shift();
      if (next) next();
      else activeGenerations -= 1;
    }
  }

  const find = async (id: string) => {
    const template = await contentTemplateRepository.find(id);
    if (!template) throw new DomainError("template_not_found", 404);
    return template;
  };

  const messagePresentation = async <T extends TemplateDraft>(draft: T): Promise<T> => {
    if (draft.kind !== "message") return draft;
    const hall = await hallSettingsRepository.get();
    return {
      ...draft,
      bodyMarkdown: [draft.bodyMarkdown, hall.outboundEmailSignatureMarkdown, hall.outboundEmailFooterMarkdown]
        .map((part, index) => (index > 0 && part ? markdownExpression(part) : part))
        .filter((part) => part?.trim())
        .join("\n\n"),
    };
  };
  const generatedPreview = async (
    type: GeneratedDocumentType,
    bodyMarkdown: string,
    subject: string | null,
    context: TemplateRenderContext = {},
    attachPdfDocuments = false,
    generatedData?: GeneratedTemplateData,
    includeMessagePresentation = true,
  ) => {
    const templates = (await contentTemplateRepository.list()).filter((candidate) => candidate.documentType === type);
    if (templates.length !== 1) throw new DomainError("template_not_found", 404);
    validateTemplateFamily(templates[0]!);
    const template = includeMessagePresentation ? await messagePresentation(templates[0]!) : templates[0]!;
    return templateRenderingService.preview(template, context, undefined, undefined, {
      attachPdfDocuments,
      generated: { bodyMarkdown, subject, data: generatedData },
    });
  };
  const generatedPdf = async (
    type: GeneratedDocumentType,
    bodyMarkdown: string,
    context: TemplateRenderContext = {},
    attachPdfDocuments = false,
    generatedData?: GeneratedTemplateData,
  ) =>
    withGenerationSlot(async () => {
      const preview = await generatedPreview(type, bodyMarkdown, null, context, attachPdfDocuments, generatedData);
      assertRenderable(preview.diagnostics);
      const content = await documentRenderer.pdf({
        html: preview.printHtml,
        headerHtml: preview.headerHtml,
        footerHtml: preview.footerHtml,
      });
      return documentRenderer.appendPdfs(
        content,
        preview.pdfAttachments.map((resource) => ({ id: resource.id, content: resource.content })),
      );
    });

  return {
    withGenerationSlot,
    generatedPreview,
    generatedPdf,
    list: () => contentTemplateRepository.list(),
    find,
    create: (input) => unitOfWork.execute(() => contentTemplateRepository.create(validatedTemplate(input))),
    async update(id, input) {
      return unitOfWork.execute(async () => {
        const template = await contentTemplateRepository.update(id, validatedTemplate(input));
        if (!template) throw new DomainError("template_not_found", 404);
        return template;
      });
    },
    delete(id) {
      return unitOfWork.execute(async () => {
        if (!(await contentTemplateRepository.delete(id))) throw new DomainError("template_not_found", 404);
      });
    },
    async preview(draft, context) {
      const presented = await messagePresentation(draft);
      const selected: TemplatePreviewContext = draft.documentType
        ? await templatePreviewContextService.resolve(draft.documentType, context)
        : { context, sourceLabel: null };
      const preview = await templateRenderingService.preview(
        {
          bodyMarkdown: presented.bodyMarkdown,
          subject: draft.subject ?? null,
          stylesheet: draft.stylesheet ?? "",
          headerHtml: draft.kind === "pdf" ? (draft.headerHtml ?? "") : "",
          footerHtml: draft.kind === "pdf" ? (draft.footerHtml ?? "") : "",
        },
        selected.context,
        undefined,
        selected.councilDecision,
        { generated: selected.generated },
      );
      return unitOfWork.execute(async () => ({
        ...preview,
        sourceLabel: selected.sourceLabel,
        sourceKind: selected.sourceKind,
      }));
    },
    previewPdf: (bodyMarkdown, context, attachPdfDocuments = true) =>
      generatedPdf("document-print", bodyMarkdown, context, attachPdfDocuments),
    previewPdfDraft(draft, context) {
      return withGenerationSlot(async () => {
        const preview = await this.preview(draft, context);
        assertRenderable(preview.diagnostics);
        return documentRenderer.pdf({
          html: preview.printHtml,
          headerHtml: preview.headerHtml,
          footerHtml: preview.footerHtml,
        });
      });
    },
    async prepareMessage(template, input) {
      const preview = await templateRenderingService.preview(
        template,
        input.context,
        input.meetingNoticeFacts,
        input.councilDecision,
        input.generatedData ? { generated: { bodyMarkdown: "", subject: null, data: input.generatedData } } : {},
      );
      assertRenderable(preview.diagnostics);
      const files = [
        ...(await attachments(resourcesClient, input.attachmentResourceIds)),
        ...(input.attachmentFiles ?? []),
      ];
      if (files.reduce((total, file) => total + file.content.byteLength, 0) > MAX_ATTACHMENT_BYTES)
        throw new DomainError("template_attachments_too_large", 413);
      return { subject: preview.subject ?? "", bodyMarkdown: preview.resolvedMarkdown ?? preview.text, files };
    },
    async generate(id, input) {
      return this.generateFromTemplate(await find(id), input);
    },
    generateFromTemplate(template, input) {
      return withGenerationSlot(async () => {
        const preview = await templateRenderingService.preview(
          await messagePresentation(template),
          input.context,
          input.meetingNoticeFacts,
          input.councilDecision,
          input.generatedData ? { generated: { bodyMarkdown: "", subject: null, data: input.generatedData } } : {},
        );
        assertRenderable(preview.diagnostics);
        const selected = [
          ...(await attachments(resourcesClient, input.attachmentResourceIds)),
          ...(input.attachmentFiles ?? []),
        ];
        if (selected.reduce((size, file) => size + file.content.byteLength, 0) > MAX_ATTACHMENT_BYTES)
          throw new DomainError("template_attachments_too_large", 413);
        const stem = safeFileStem(template.documentType);

        if (template.kind === "pdf") {
          const incompatible = selected.find((resource) => resource.mediaType !== "application/pdf");
          if (incompatible) throw new DomainError("resource_content_unavailable", 409);
          const generated = await documentRenderer.pdf({
            html: preview.printHtml,
            headerHtml: preview.headerHtml,
            footerHtml: preview.footerHtml,
          });
          const referencedIds = new Set(preview.pdfAttachments.map((resource) => resource.id));
          const content = await documentRenderer.appendPdfs(generated, [
            ...preview.pdfAttachments.map((resource) => ({ id: resource.id, content: resource.content })),
            ...selected
              .filter((resource) => !referencedIds.has(resource.id))
              .map((resource) => ({ id: resource.id, content: resource.content })),
          ]);
          const result = { content, fileName: `${stem}.pdf`, mediaType: "application/pdf" };
          return unitOfWork.execute(async () => result);
        }

        const hall = await hallSettingsRepository.get();
        const composer = new MailComposer({
          headers: { "X-Unsent": "1" },
          from: hall.outboundEmailSenderAddress
            ? { name: hall.outboundEmailSenderName || hall.name, address: hall.outboundEmailSenderAddress }
            : undefined,
          replyTo: hall.outboundEmailReplyToAddress ?? undefined,
          to: input.to,
          cc: input.cc,
          bcc: input.bcc,
          subject: preview.subject ?? "",
          html: preview.html,
          text: preview.text,
          attachments: selected.map((resource) => ({
            filename: resource.fileName,
            contentType: resource.mediaType,
            content: resource.content,
          })),
          disableFileAccess: true,
          disableUrlAccess: true,
        });
        const message = composer.compile();
        message.keepBcc = true;
        const result = {
          content: await message.build(),
          fileName: `${stem}.eml`,
          mediaType: "message/rfc822",
        };
        return unitOfWork.execute(async () => result);
      });
    },
  };
}
