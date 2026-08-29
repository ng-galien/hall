import type { ContentTemplate, TemplateRenderContext } from "@hall/domain";
import { type Diagnostic, parse, serialize } from "@hall/templating";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import type {
  ContentTemplateRepository,
  HallSettingsRepository,
  ResourceRepository,
  SaveContentTemplate,
  StoredDocumentResource,
  UnitOfWork,
} from "../repositories/contracts.js";
import type { DocumentRenderer } from "./documentRenderer.js";
import { DomainError } from "./errors.js";
import type { TemplatePreview, TemplateRenderingService } from "./templateRendering.js";

export interface TemplateDraft {
  kind: ContentTemplate["kind"];
  bodyMarkdown: string;
  subject?: string | null;
  stylesheet?: string;
  headerHtml?: string;
  footerHtml?: string;
}

export interface GenerateTemplateInput {
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
  previewPdf(bodyMarkdown: string, context: TemplateRenderContext): Promise<Buffer>;
  generate(id: string, input: GenerateTemplateInput): Promise<GeneratedFile>;
}

function canonicalSource(source: string): string {
  return serialize(parse(source));
}

function canonicalTemplate(input: SaveContentTemplate): SaveContentTemplate {
  return {
    ...input,
    bodyMarkdown: canonicalSource(input.bodyMarkdown),
    subject: input.subject === null ? null : canonicalSource(input.subject).trim(),
  };
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

async function attachments(repository: ResourceRepository, resourceIds: string[]): Promise<StoredDocumentResource[]> {
  const result: StoredDocumentResource[] = [];
  let totalBytes = 0;
  for (const id of new Set(resourceIds)) {
    const resource = await repository.find(id);
    if (!resource) throw new DomainError("resource_not_found", 404);
    if (resource.kind !== "document") throw new DomainError("resource_content_unavailable", 409);
    totalBytes += resource.content.byteLength;
    if (totalBytes > MAX_ATTACHMENT_BYTES) {
      throw new DomainError("template_attachments_too_large", 413);
    }
    result.push(resource);
  }
  return result;
}

export function createContentTemplateService({
  contentTemplateRepository,
  templateRenderingService,
  documentRenderer,
  resourceRepository,
  hallSettingsRepository,
  unitOfWork,
}: {
  contentTemplateRepository: ContentTemplateRepository;
  templateRenderingService: TemplateRenderingService;
  documentRenderer: DocumentRenderer;
  resourceRepository: ResourceRepository;
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

  return {
    list: () => contentTemplateRepository.list(),
    find,
    create: (input) => contentTemplateRepository.create(canonicalTemplate(input)),
    async update(id, input) {
      const template = await contentTemplateRepository.update(id, canonicalTemplate(input));
      if (!template) throw new DomainError("template_not_found", 404);
      return template;
    },
    delete(id) {
      return unitOfWork.execute(async () => {
        if (!(await contentTemplateRepository.delete(id))) throw new DomainError("template_not_found", 404);
      });
    },
    async preview(draft, context) {
      const preview = await templateRenderingService.preview(
        {
          bodyMarkdown: draft.bodyMarkdown,
          subject: draft.subject ?? null,
          stylesheet: draft.kind === "pdf" ? (draft.stylesheet ?? "") : "",
          headerHtml: draft.kind === "pdf" ? (draft.headerHtml ?? "") : "",
          footerHtml: draft.kind === "pdf" ? (draft.footerHtml ?? "") : "",
        },
        context,
      );
      return unitOfWork.execute(async () => preview);
    },
    previewPdf(bodyMarkdown, context) {
      return withGenerationSlot(async () => {
        const preview = await templateRenderingService.preview(
          {
            bodyMarkdown,
            subject: null,
            stylesheet: "",
            headerHtml: "",
            footerHtml: "",
          },
          context,
        );
        assertRenderable(preview.diagnostics);
        return documentRenderer.pdf({
          html: preview.printHtml,
          headerHtml: preview.headerHtml,
          footerHtml: preview.footerHtml,
        });
      });
    },
    generate(id, input) {
      return withGenerationSlot(async () => {
        const template = await find(id);
        const preview = await templateRenderingService.preview(template, input.context);
        assertRenderable(preview.diagnostics);
        const selected = await attachments(resourceRepository, input.attachmentResourceIds);
        const stem = safeFileStem(template.documentType);

        if (template.kind === "pdf") {
          const incompatible = selected.find((resource) => resource.mediaType !== "application/pdf");
          if (incompatible) throw new DomainError("resource_content_unavailable", 409);
          const generated = await documentRenderer.pdf({
            html: preview.printHtml,
            headerHtml: preview.headerHtml,
            footerHtml: preview.footerHtml,
          });
          const content = await documentRenderer.appendPdfs(
            generated,
            selected.map((resource) => resource.content),
          );
          const result = { content, fileName: `${stem}.pdf`, mediaType: "application/pdf" };
          return unitOfWork.execute(async () => result);
        }

        const hall = await hallSettingsRepository.get();
        const composer = new MailComposer({
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
