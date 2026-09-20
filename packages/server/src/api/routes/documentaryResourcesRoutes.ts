import { basename, extname } from "node:path";
import {
  createResourceSchema,
  documentContentHashesSchema,
  editorAssetTitleSchema,
  generateEventInvitationSchema,
  legalReferenceSearchInputSchema,
  refreshLegalReferenceSchema,
  relocateResourceSchema,
  resolveLegalReferenceSchema,
  resourceIdSchema,
  resourcePathSchema,
  resourceReferenceSchema,
  resourceSearchCriteriaSchema,
  updateResourceContentSchema,
  updateResourceMetadataSchema,
} from "@hall/api-contract";
import { type NextFunction, type Request, type Response, Router } from "express";
import multer from "multer";
import type { Cradle } from "../../core/container.js";
import { requirePermission } from "../../security/authorization.js";
import { DomainError } from "../../services/errors.js";
import { parseSpreadsheetImport } from "../../services/spreadsheetImportService.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";
import { routeParameter } from "../routeParameter.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// @implements-requirement HALL-FR-DOC-280
export function createDocumentaryResourcesRouter({
  documentaryResourceService,
  councilBusinessWorkspaceService,
  eventInvitationService,
  realtimeEvents,
  requestContext,
}: Cradle): Router {
  const router = Router();
  const publishSavedTextChange = (request: Request, representation: { properties?: Record<string, unknown> }): void => {
    const resourceId = resourceIdSchema.safeParse(representation.properties?.id);
    if (representation.properties?.kind !== "text" || !resourceId.success || !request.principal) return;
    realtimeEvents.publish({
      type: "resource.changed",
      resourceId: resourceId.data,
      actor: { id: request.principal.id, displayName: request.principal.displayName },
    });
  };
  const requireBusinessUpdate = requirePermission("council-business.update");
  const requireBusinessUpdateForContext = (request: Request, response: Response, next: NextFunction): void => {
    if (request.body?.councilBusinessId) {
      requireBusinessUpdate(request, response, next);
      return;
    }
    next();
  };
  const requireBusinessUpdateForOwnedResource = async (request: Request, response: Response, next: NextFunction) => {
    const reference = resourceReferenceSchema.parse(routeParameter(request.params.reference));
    const representation = await documentaryResourceService.open(reference);
    const resourceId = representation.properties?.id;
    const businesses = await councilBusinessWorkspaceService.list();
    const belongsToBusiness = businesses.some(
      (business) => business.folderResourceId === resourceId || business.reportResourceId === resourceId,
    );
    if (belongsToBusiness) return requireBusinessUpdate(request, response, next);
    next();
  };
  const uploadFile: ReturnType<typeof upload.single> = (request, response, next) => {
    const context = requestContext.current();
    upload.single("file")(request, response, (error) => {
      const resume = () => (error ? next(error) : next());
      if (context) requestContext.run(context, resume);
      else resume();
    });
  };

  router.get("/catalog", requirePermission("workspace.read"), async (_request, response) => {
    response.json(await documentaryResourceService.listAll());
  });

  const queryValues = (value: unknown): string[] =>
    typeof value === "string"
      ? value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [];

  router.get("/documents/by-hashes", requirePermission("workspace.read"), async (request, response) => {
    const hashes = documentContentHashesSchema.parse(queryValues(request.query.sha256));
    response.json(await documentaryResourceService.findDocumentsByHashes(hashes));
  });

  router.get("/search", requirePermission("workspace.read"), async (request, response) => {
    const criteria = resourceSearchCriteriaSchema.parse({
      offset: request.query.offset === undefined ? undefined : Number(request.query.offset),
      limit: request.query.limit === undefined ? undefined : Number(request.query.limit),
      context: request.query.context,
      preferredIds: queryValues(request.query.preferredIds),
      excludedIds: queryValues(request.query.excludedIds),
      includedIds: request.query.includedIds === undefined ? undefined : queryValues(request.query.includedIds),
      query: typeof request.query.query === "string" ? request.query.query : "",
      paths: queryValues(request.query.paths),
      kinds: queryValues(request.query.kinds),
      tags: queryValues(request.query.tags),
      readiness: queryValues(request.query.readiness),
      media: queryValues(request.query.media),
    });
    response.json(await documentaryResourceService.search(criteria));
  });

  router.get("/", requirePermission("workspace.read"), async (request, response) => {
    const path = resourcePathSchema.parse(typeof request.query.path === "string" ? request.query.path : "");
    response.json(await documentaryResourceService.listFolder(path));
  });

  router.post(
    "/",
    requireActionPermission("resource.create"),
    requireBusinessUpdateForContext,
    async (request, response) => {
      response.status(201).json(await documentaryResourceService.create(createResourceSchema.parse(request.body)));
    },
  );

  router.post(
    "/documents",
    requireActionPermission("resource.create-document"),
    uploadFile,
    requireBusinessUpdateForContext,
    async (request, response) => {
      if (!request.file) throw new DomainError("invalid_request");
      response.status(201).json(
        await documentaryResourceService.createDocument({
          path: resourcePathSchema.parse(request.body.path ?? ""),
          councilBusinessId: resourceIdSchema.optional().parse(request.body.councilBusinessId),
          name: request.body.name ? String(request.body.name) : request.file.originalname,
          fileName: request.file.originalname,
          content: request.file.buffer,
        }),
      );
    },
  );

  router.post(
    "/spreadsheets/import",
    requireActionPermission("resource.import-spreadsheet"),
    uploadFile,
    requireBusinessUpdateForContext,
    async (request, response) => {
      if (!request.file) throw new DomainError("invalid_request");
      const name = request.body.name
        ? String(request.body.name)
        : basename(request.file.originalname, extname(request.file.originalname));
      const path = resourcePathSchema.parse(request.body.path ?? "");
      const document = await parseSpreadsheetImport({
        title: name,
        folderPath: path,
        tags: [],
        fileName: request.file.originalname,
        content: request.file.buffer,
      });
      response.status(201).json(
        await documentaryResourceService.create({
          kind: "spreadsheet",
          path,
          name,
          document,
          councilBusinessId: resourceIdSchema.optional().parse(request.body.councilBusinessId),
        }),
      );
    },
  );

  router.post(
    "/editor-assets",
    requireActionPermission("resource.create-editor-asset"),
    uploadFile,
    async (request, response) => {
      if (!request.file || request.body.ownerKind !== "textResourceContent") {
        throw new DomainError("invalid_request");
      }
      const created = await documentaryResourceService.createEditorAsset({
        ownerId: resourceIdSchema.parse(request.body.ownerId),
        title: editorAssetTitleSchema.parse(request.body.title),
        fileName: request.file.originalname,
        content: request.file.buffer,
      });
      response.status(201).json(created.representation);
    },
  );

  router.post(
    "/legal-references/search",
    requireActionPermission("resource.search-legal-references"),
    async (request, response) => {
      response.json(
        await documentaryResourceService.searchLegalReferences(legalReferenceSearchInputSchema.parse(request.body)),
      );
    },
  );

  router.post(
    "/:reference/legal-reference/resolve",
    requireActionPermission("resource.resolve-legal-reference"),
    async (request, response) => {
      response.json(
        await documentaryResourceService.resolveLegalReference(
          resourceReferenceSchema.parse(routeParameter(request.params.reference)),
          resolveLegalReferenceSchema.parse(request.body),
        ),
      );
    },
  );

  router.post(
    "/:reference/legal-reference/refresh",
    requireActionPermission("resource.refresh-legal-reference"),
    async (request, response) => {
      const { expectedSnapshotHash } = refreshLegalReferenceSchema.parse(request.body);
      response.json(
        await documentaryResourceService.refreshLegalReference(
          resourceReferenceSchema.parse(routeParameter(request.params.reference)),
          expectedSnapshotHash,
        ),
      );
    },
  );

  router.get("/editor-assets/:id/content", requirePermission("workspace.read"), async (request, response) => {
    const content = await documentaryResourceService.readEditorAssetContent(
      resourceIdSchema.parse(routeParameter(request.params.id)),
    );
    response.setHeader("Content-Type", content.mediaType);
    response.setHeader("Content-Length", String(content.byteSize));
    response.setHeader("ETag", `"${content.contentSha256}"`);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "sandbox");
    response.send(content.content);
  });

  router.get("/editor-assets/:id", requirePermission("workspace.read"), async (request, response) => {
    const asset = await documentaryResourceService.openEditorAsset(
      resourceIdSchema.parse(routeParameter(request.params.id)),
    );
    response.json(asset.representation);
  });

  router.get("/binary-references/:id/content", requirePermission("workspace.read"), async (request, response) => {
    const content = await documentaryResourceService.readBinaryReferenceContent(
      resourceIdSchema.parse(routeParameter(request.params.id)),
    );
    response.setHeader("Content-Type", content.mediaType);
    response.setHeader("Content-Length", String(content.byteSize));
    response.setHeader("ETag", `"${content.contentSha256}"`);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "sandbox");
    response.send(content.content);
  });

  router.get("/:reference/content", requirePermission("workspace.read"), async (request, response) => {
    const content = await documentaryResourceService.readDocumentContent(
      resourceReferenceSchema.parse(routeParameter(request.params.reference)),
    );
    response.setHeader("Content-Type", content.mediaType);
    response.setHeader("Content-Length", String(content.byteSize));
    response.setHeader("ETag", `"${content.contentSha256}"`);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "sandbox");
    response.send(content.content);
  });

  router.get("/:reference/changes", requirePermission("workspace.read"), async (request, response) => {
    response.json(
      await documentaryResourceService.listChanges(resourceReferenceSchema.parse(routeParameter(request.params.reference))),
    );
  });

  router.get("/:reference/preview", requirePermission("workspace.read"), async (request, response) => {
    const preview = await documentaryResourceService.previewDocument(
      resourceReferenceSchema.parse(routeParameter(request.params.reference)),
    );
    response.setHeader("Content-Type", preview.mediaType);
    response.setHeader("Content-Length", String(preview.byteSize));
    response.setHeader("ETag", `"${preview.contentSha256}"`);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "sandbox");
    response.send(preview.content);
  });

  router.put(
    "/:reference/binary",
    requireActionPermission("resource.replace-document-content"),
    uploadFile,
    async (request, response) => {
      if (!request.file) throw new DomainError("invalid_request");
      response.json(
        await documentaryResourceService.replaceDocumentContent(
          resourceReferenceSchema.parse(routeParameter(request.params.reference)),
          { fileName: request.file.originalname, content: request.file.buffer },
        ),
      );
    },
  );

  router.patch(
    "/:reference/location",
    requireActionPermission("resource.relocate"),
    requireBusinessUpdateForOwnedResource,
    async (request, response) => {
      const changed = await documentaryResourceService.relocate(
        resourceReferenceSchema.parse(routeParameter(request.params.reference)),
        relocateResourceSchema.parse(request.body),
      );
      publishSavedTextChange(request, changed);
      response.json(changed);
    },
  );

  router.patch(
    "/:reference/metadata",
    requireActionPermission("resource.update-metadata"),
    requireBusinessUpdateForOwnedResource,
    async (request, response) => {
      const changed = await documentaryResourceService.updateMetadata(
        resourceReferenceSchema.parse(routeParameter(request.params.reference)),
        updateResourceMetadataSchema.parse(request.body),
      );
      publishSavedTextChange(request, changed);
      response.json(changed);
    },
  );

  router.put(
    "/:reference/content",
    requireActionPermission("resource.update-content"),
    requireBusinessUpdateForOwnedResource,
    async (request, response) => {
      const changed = await documentaryResourceService.updateContent(
        resourceReferenceSchema.parse(routeParameter(request.params.reference)),
        updateResourceContentSchema.parse(request.body),
      );
      publishSavedTextChange(request, changed);
      response.json(changed);
    },
  );

  router.post(
    "/:reference/event-invitation",
    requireActionPermission("resource.generate-event-invitation"),
    async (request, response) => {
      const message = await eventInvitationService.generate(
        resourceReferenceSchema.parse(routeParameter(request.params.reference)),
        generateEventInvitationSchema.parse(request.body),
      );
      response
        .status(200)
        .type(message.mediaType)
        .setHeader("Content-Disposition", `attachment; filename="${message.fileName}"`)
        .send(message.content);
    },
  );

  router.get("/:reference", requirePermission("workspace.read"), async (request, response) => {
    response.json(
      await documentaryResourceService.open(resourceReferenceSchema.parse(routeParameter(request.params.reference))),
    );
  });

  router.delete("/:reference", requireActionPermission("resource.delete"), async (request, response) => {
    await documentaryResourceService.delete(resourceReferenceSchema.parse(routeParameter(request.params.reference)));
    response.status(204).end();
  });

  return router;
}
