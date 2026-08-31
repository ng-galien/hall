import { basename, extname } from "node:path";
import {
  createFolderSchema,
  createGeographicResourceSchema,
  createLegalReferenceResourceSchema,
  createRemoteResourceSchema,
  createSpreadsheetResourceSchema,
  createTextResourceSchema,
  editorAssetOwnerKindSchema,
  folderPathSchema,
  promoteEditorAssetSchema,
  refreshLegalReferenceSchema,
  renameFolderSchema,
  resolveLegalReferenceResourceSchema,
  resourceTagsSchema,
  searchLegalReferencesSchema,
  updateGeographicResourceSchema,
  updateResourceSchema,
  updateSpreadsheetResourceSchema,
} from "@hall/domain";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { Cradle } from "../../core/container.js";
import { requirePermission } from "../../security/authorization.js";
import { DomainError } from "../../services/errors.js";
import { routeParameter } from "../routeParameter.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const resourceKindSchema = z.enum(["text", "spreadsheet", "document", "remote", "geographic", "legalReference"]);
const documentCategorySchema = z.enum([
  "report",
  "draftCouncilDecision",
  "meetingNotice",
  "minutes",
  "proxy",
  "supporting",
]);
const resourceUsageSchema = z.enum(["document", "editorAsset"]);
const editorAssetTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((title) => !z.string().uuid().safeParse(title).success)
  .refine((title) => !/^(?:codex[-_ ]?)?clipboard[-_ ][0-9a-f-]{16,}(?:\.[a-z0-9]+)?$/i.test(title));

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

export function createResourcesRouter({
  resourceService,
  spreadsheetImportService,
  documentPreviewService,
  editorAssetService,
  requestContext,
}: Cradle): Router {
  const router = Router();
  const uploadFile: ReturnType<typeof upload.single> = (request, response, next) => {
    const context = requestContext.current();
    upload.single("file")(request, response, (error) => {
      const resume = () => (error ? next(error) : next());
      if (context) requestContext.run(context, resume);
      else resume();
    });
  };

  router.get("/", requirePermission("workspace.read"), async (request, response) => {
    const folderPath =
      typeof request.query.folderPath === "string" ? folderPathSchema.parse(request.query.folderPath) : undefined;
    const kind = typeof request.query.kind === "string" ? resourceKindSchema.parse(request.query.kind) : undefined;
    const meetingId =
      typeof request.query.meetingId === "string" ? z.string().uuid().parse(request.query.meetingId) : undefined;
    const tags = request.query.tags === undefined ? undefined : parseTags(request.query.tags);
    let usage = typeof request.query.usage === "string" ? resourceUsageSchema.parse(request.query.usage) : undefined;
    const editorOwnerKind =
      typeof request.query.editorOwnerKind === "string"
        ? editorAssetOwnerKindSchema.parse(request.query.editorOwnerKind)
        : undefined;
    const editorOwnerId =
      typeof request.query.editorOwnerId === "string"
        ? z.string().uuid().parse(request.query.editorOwnerId)
        : undefined;
    if ((editorOwnerKind === undefined) !== (editorOwnerId === undefined)) throw new DomainError("invalid_request");
    if (editorOwnerKind && editorOwnerId) usage = usage ?? "editorAsset";
    response.json(
      await resourceService.list({
        folderPath,
        kind,
        meetingId,
        tags,
        usage,
        editorOwner: editorOwnerKind && editorOwnerId ? { kind: editorOwnerKind, id: editorOwnerId } : undefined,
      }),
    );
  });

  router.get("/paths", requirePermission("workspace.read"), async (_request, response) => {
    response.json(await resourceService.listFolderPaths());
  });

  router.post("/paths", requirePermission("workspace.write"), async (request, response) => {
    const { parentPath, name } = createFolderSchema.parse(request.body);
    response.status(201).json(await resourceService.createFolder(parentPath, name));
  });

  router.put("/paths", requirePermission("workspace.write"), async (request, response) => {
    const { folderPath, name } = renameFolderSchema.parse(request.body);
    response.json(await resourceService.renameFolder(folderPath, name));
  });

  router.post("/texts", requirePermission("workspace.write"), async (request, response) => {
    const { title, folderPath, tags, content } = createTextResourceSchema.parse({
      ...request.body,
      kind: "text",
    });
    response.status(201).json(await resourceService.createText({ title, folderPath, tags, content }));
  });

  router.post("/remotes", requirePermission("workspace.write"), async (request, response) => {
    const { title, folderPath, tags, url } = createRemoteResourceSchema.parse({
      ...request.body,
      kind: "remote",
    });
    response.status(201).json(await resourceService.createRemote({ title, folderPath, tags, url }));
  });

  router.post("/spreadsheets", requirePermission("workspace.write"), async (request, response) => {
    response
      .status(201)
      .json(await resourceService.createSpreadsheet(createSpreadsheetResourceSchema.parse(request.body)));
  });

  router.post("/spreadsheets/import", requirePermission("workspace.write"), uploadFile, async (request, response) => {
    if (!request.file) throw new DomainError("invalid_request");
    const fallbackTitle = basename(request.file.originalname, extname(request.file.originalname));
    response.status(201).json(
      await spreadsheetImportService.import({
        title: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .parse(request.body.title || fallbackTitle),
        folderPath: folderPathSchema.parse(request.body.folderPath ?? ""),
        tags: parseTags(request.body.tags),
        fileName: request.file.originalname,
        content: request.file.buffer,
      }),
    );
  });

  router.post("/geographic", requirePermission("workspace.write"), async (request, response) => {
    response
      .status(201)
      .json(await resourceService.createGeographic(createGeographicResourceSchema.parse(request.body)));
  });

  router.post("/legal-references/search", requirePermission("workspace.read"), async (request, response) => {
    response.json(await resourceService.searchLegalReferences(searchLegalReferencesSchema.parse(request.body)));
  });

  router.post("/legal-references", requirePermission("workspace.write"), async (request, response) => {
    response
      .status(201)
      .json(await resourceService.createLegalReference(createLegalReferenceResourceSchema.parse(request.body)));
  });

  router.post(
    "/:resourceId/legal-reference/resolve",
    requirePermission("workspace.write"),
    async (request, response) => {
      response.json(
        await resourceService.resolveLegalReference(
          routeParameter(request.params.resourceId),
          resolveLegalReferenceResourceSchema.parse(request.body),
        ),
      );
    },
  );

  router.put("/:resourceId/geography", requirePermission("workspace.write"), async (request, response) => {
    response.json(
      await resourceService.updateGeographic(
        routeParameter(request.params.resourceId),
        updateGeographicResourceSchema.parse(request.body),
      ),
    );
  });

  router.put("/:resourceId/spreadsheet", requirePermission("workspace.write"), async (request, response) => {
    response.json(
      await resourceService.updateSpreadsheet(
        routeParameter(request.params.resourceId),
        updateSpreadsheetResourceSchema.parse(request.body),
      ),
    );
  });

  router.post(
    "/:resourceId/legal-reference/refresh",
    requirePermission("workspace.write"),
    async (request, response) => {
      const { expectedSnapshotHash } = refreshLegalReferenceSchema.parse(request.body);
      response.json(
        await resourceService.refreshLegalReference(routeParameter(request.params.resourceId), expectedSnapshotHash),
      );
    },
  );

  router.post("/documents", requirePermission("workspace.write"), uploadFile, async (request, response) => {
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
        category: documentCategorySchema.parse(request.body.category ?? "supporting"),
        content: request.file.buffer,
      }),
    );
  });

  router.post("/editor-assets", requirePermission("workspace.write"), uploadFile, async (request, response) => {
    if (!request.file) throw new DomainError("invalid_request");
    response.status(201).json(
      await editorAssetService.create({
        title: editorAssetTitleSchema.parse(request.body.title),
        fileName: request.file.originalname,
        owner: {
          kind: editorAssetOwnerKindSchema.parse(request.body.ownerKind),
          id: z.string().uuid().parse(request.body.ownerId),
        },
        content: request.file.buffer,
      }),
    );
  });

  router.post("/:resourceId/promote", requirePermission("workspace.write"), async (request, response) => {
    response.json(
      await editorAssetService.promote(
        routeParameter(request.params.resourceId),
        promoteEditorAssetSchema.parse(request.body),
      ),
    );
  });

  router.get("/:resourceId/content", requirePermission("workspace.read"), async (request, response) => {
    const resource = await resourceService.find(routeParameter(request.params.resourceId));
    if (!resource) throw new DomainError("resource_not_found", 404);
    if (resource.kind !== "document") throw new DomainError("resource_content_unavailable", 409);
    response.setHeader("Content-Type", resource.mediaType);
    response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(resource.fileName)}`);
    response.setHeader("ETag", `"${resource.contentSha256}"`);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "sandbox");
    response.send(resource.content);
  });

  router.get("/:resourceId/preview", requirePermission("workspace.read"), async (request, response) => {
    const resourceId = routeParameter(request.params.resourceId);
    const resource = await resourceService.find(resourceId);
    if (!resource) throw new DomainError("resource_not_found", 404);
    if (resource.kind !== "document") throw new DomainError("resource_preview_unavailable", 409);
    const native = ["pdf", "jpeg", "png"].includes(resource.format);
    const preview = native ? resource : await documentPreviewService.get(resourceId);
    response.setHeader("Content-Type", native ? resource.mediaType : "application/pdf");
    response.setHeader("Content-Disposition", "inline");
    response.setHeader("Content-Length", String(preview.byteSize));
    response.setHeader("ETag", `"${preview.contentSha256}"`);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "sandbox");
    response.send(preview.content);
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
