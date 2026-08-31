import { randomUUID } from "node:crypto";
import {
  createContentTemplateSchema,
  generateContentTemplateSchema,
  previewContentTemplateSchema,
  previewPdfSchema,
  updateContentTemplateSchema,
} from "@hall/domain";
import { Router } from "express";
import { z } from "zod";
import type { Cradle } from "../../core/container.js";
import { requirePermission } from "../../security/authorization.js";
import { routeParameter } from "../routeParameter.js";

const referenceQuerySchema = z.object({
  type: z.enum(["member", "resource", "councilBusiness", "decision", "meeting"]),
  query: z.string().trim().max(160).default(""),
});

const PDF_PREVIEW_TTL_MS = 5 * 60 * 1_000;

function contains(label: string, query: string): boolean {
  return label.toLocaleLowerCase("fr-FR").includes(query.toLocaleLowerCase("fr-FR"));
}

export function createContentTemplatesRouter(cradle: Cradle): Router {
  const {
    contentTemplateService,
    councilMemberRepository,
    councilMeetingRepository,
    councilDecisionRepository,
    councilBusinessRepository,
    resourceRepository,
  } = cradle;
  const router = Router();
  const pdfPreviews = new Map<string, { content: Buffer; expiresAt: number }>();

  router.get("/", requirePermission("workspace.read"), async (_request, response) => {
    response.json(await contentTemplateService.list());
  });

  router.get("/references", requirePermission("workspace.read"), async (request, response) => {
    const { type, query } = referenceQuerySchema.parse(request.query);
    let references: Array<{ type: typeof type; id: string; label: string }> = [];
    if (type === "member") {
      references = (await councilMemberRepository.list()).map((member) => ({
        type,
        id: member.id,
        label: `${member.firstName} ${member.lastName}`,
      }));
    }
    if (type === "meeting") {
      references = (await councilMeetingRepository.list()).map((meeting) => ({
        type,
        id: meeting.id,
        label: `${meeting.number} - ${meeting.startsAt.slice(0, 10)}`,
      }));
    }
    if (type === "councilBusiness") {
      references = (await councilBusinessRepository.list()).map((business) => ({
        type,
        id: business.id,
        label: business.title,
      }));
    }
    if (type === "decision") {
      references = (await councilDecisionRepository.list()).map((decision) => ({
        type,
        id: decision.id,
        label: decision.number ? `${decision.number} - ${decision.title}` : decision.title,
      }));
    }
    if (type === "resource") {
      references = (await resourceRepository.list()).map((resource) => ({
        type,
        id: resource.id,
        label: resource.title,
      }));
    }
    response.json(references.filter((reference) => contains(reference.label, query)).slice(0, 30));
  });

  router.post("/preview", requirePermission("workspace.read"), async (request, response) => {
    const input = previewContentTemplateSchema.parse(request.body);
    const preview = await contentTemplateService.preview(input, input.context);
    response.json({ html: preview.html, subject: preview.subject, diagnostics: preview.diagnostics });
  });

  router.post("/preview-pdf", requirePermission("workspace.read"), async (request, response) => {
    const input = previewPdfSchema.parse(request.body);
    const content = await contentTemplateService.previewPdf(input.bodyMarkdown, input.context);
    if (request.query.delivery === "url") {
      const now = Date.now();
      for (const [id, preview] of pdfPreviews) if (preview.expiresAt <= now) pdfPreviews.delete(id);
      const id = randomUUID();
      pdfPreviews.set(id, { content, expiresAt: now + PDF_PREVIEW_TTL_MS });
      response.status(201).json({ url: `/api/templates/preview-pdf/${id}` });
      return;
    }
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", "inline; filename=preview.pdf");
    response.setHeader("Content-Length", String(content.byteLength));
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "sandbox");
    response.send(content);
  });

  router.get("/preview-pdf/:previewId", requirePermission("workspace.read"), (request, response) => {
    const id = routeParameter(request.params.previewId);
    const preview = pdfPreviews.get(id);
    if (!preview || preview.expiresAt <= Date.now()) {
      pdfPreviews.delete(id);
      response.status(404).json({ code: "template_preview_not_found", status: 404 });
      return;
    }
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", "inline; filename=preview.pdf");
    response.setHeader("Content-Length", String(preview.content.byteLength));
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.send(preview.content);
  });

  router.post("/", requirePermission("workspace.write"), async (request, response) => {
    response.status(201).json(await contentTemplateService.create(createContentTemplateSchema.parse(request.body)));
  });

  router.get("/:templateId", requirePermission("workspace.read"), async (request, response) => {
    response.json(await contentTemplateService.find(routeParameter(request.params.templateId)));
  });

  router.put("/:templateId", requirePermission("workspace.write"), async (request, response) => {
    response.json(
      await contentTemplateService.update(
        routeParameter(request.params.templateId),
        updateContentTemplateSchema.parse(request.body),
      ),
    );
  });

  router.delete("/:templateId", requirePermission("workspace.write"), async (request, response) => {
    await contentTemplateService.delete(routeParameter(request.params.templateId));
    response.status(204).end();
  });

  router.post("/:templateId/generate", requirePermission("workspace.read"), async (request, response) => {
    const generated = await contentTemplateService.generate(
      routeParameter(request.params.templateId),
      generateContentTemplateSchema.parse(request.body),
    );
    response.setHeader("Content-Type", generated.mediaType);
    response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(generated.fileName)}`);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.send(generated.content);
  });

  return router;
}
