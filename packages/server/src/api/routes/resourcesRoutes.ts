import { createTextResourceSchema, folderPathSchema, resourceTagsSchema, updateResourceSchema } from "@hall/domain";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { Cradle } from "../../core/container.js";
import { safeDocumentMediaType } from "../../domain/documentPolicy.js";
import { requirePermission } from "../../security/authorization.js";
import { DomainError } from "../../services/errors.js";
import { routeParameter } from "../routeParameter.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const resourceKindSchema = z.enum(["text", "document"]);
const documentCategorySchema = z.enum([
  "report",
  "draftCouncilDecision",
  "meetingNotice",
  "minutes",
  "proxy",
  "supporting",
]);

function parseTags(value: unknown): string[] {
  if (value === undefined || value === null || value === "") return [];
  const rawValues = Array.isArray(value) ? value : [value];
  const tags = rawValues.flatMap((rawValue) => {
    if (typeof rawValue !== "string") throw new DomainError("invalid_request");
    if (rawValue.trim().startsWith("[")) {
      try {
        const parsed = JSON.parse(rawValue);
        if (!Array.isArray(parsed)) throw new DomainError("invalid_request");
        return parsed;
      } catch (error) {
        if (error instanceof DomainError) throw error;
        throw new DomainError("invalid_request");
      }
    }
    return rawValue.split(",");
  });
  return resourceTagsSchema.parse(tags);
}

export function createResourcesRouter({ resourceService }: Cradle): Router {
  const router = Router();

  router.get("/", requirePermission("workspace.read"), async (request, response) => {
    const folderPath =
      typeof request.query.folderPath === "string" ? folderPathSchema.parse(request.query.folderPath) : undefined;
    const kind = typeof request.query.kind === "string" ? resourceKindSchema.parse(request.query.kind) : undefined;
    const meetingId =
      typeof request.query.meetingId === "string" ? z.string().uuid().parse(request.query.meetingId) : undefined;
    const tags = request.query.tags === undefined ? undefined : parseTags(request.query.tags);
    response.json(await resourceService.list({ folderPath, kind, meetingId, tags }));
  });

  router.get("/paths", requirePermission("workspace.read"), async (_request, response) => {
    response.json(await resourceService.listFolderPaths());
  });

  router.post("/texts", requirePermission("workspace.write"), async (request, response) => {
    const { title, folderPath, tags, content } = createTextResourceSchema.parse({
      ...request.body,
      kind: "text",
    });
    response.status(201).json(await resourceService.createText({ title, folderPath, tags, content }));
  });

  router.post("/documents", requirePermission("workspace.write"), upload.single("file"), async (request, response) => {
    if (!request.file) throw new DomainError("invalid_request");
    const folderPath = folderPathSchema.parse(request.body.folderPath ?? "");
    const meetingId = request.body.meetingId ? z.string().uuid().parse(request.body.meetingId) : null;
    response.status(201).json(
      await resourceService.createDocument({
        title: z
          .string()
          .trim()
          .min(1)
          .parse(request.body.title ?? request.file.originalname),
        folderPath,
        tags: parseTags(request.body.tags),
        meetingId,
        fileName: request.file.originalname,
        mediaType: safeDocumentMediaType(request.file.originalname),
        category: documentCategorySchema.parse(request.body.category ?? "supporting"),
        content: request.file.buffer,
      }),
    );
  });

  router.get("/:resourceId/content", requirePermission("workspace.read"), async (request, response) => {
    const resource = await resourceService.find(routeParameter(request.params.resourceId));
    if (!resource) throw new DomainError("resource_not_found", 404);
    if (resource.kind !== "document") throw new DomainError("resource_content_unavailable", 409);
    response.setHeader("Content-Type", resource.mediaType);
    response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(resource.fileName)}`);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "sandbox");
    response.send(resource.content);
  });

  router.get("/:resourceId", requirePermission("workspace.read"), async (request, response) => {
    response.json(await resourceService.getDetails(routeParameter(request.params.resourceId)));
  });

  router.put("/:resourceId", requirePermission("workspace.write"), async (request, response) => {
    response.json(
      await resourceService.update(routeParameter(request.params.resourceId), updateResourceSchema.parse(request.body)),
    );
  });

  router.delete("/:resourceId", requirePermission("workspace.write"), async (request, response) => {
    await resourceService.delete(routeParameter(request.params.resourceId));
    response.status(204).end();
  });

  return router;
}
