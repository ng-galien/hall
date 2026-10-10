import { basename, extname } from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import {
  createGeographicFeatureNoteSchema,
  GEOGRAPHIC_LAYER_MAX_FILE_BYTES,
  importMunicipalPropertySchema,
  linkGeographicLayerSchema,
  resourceIdSchema,
  resourcePathSchema,
  resourceReferenceSchema,
  unlinkGeographicLayerSchema,
} from "@hall/api-contract";
import { type NextFunction, type Request, type Response, Router } from "express";
import multer from "multer";
import type { Cradle } from "../../core/container.js";
import { requirePermission } from "../../security/authorization.js";
import { DomainError } from "../../services/errors.js";
import { GeographicLayerImportError } from "../../services/geographicLayerImport.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";
import { sendProblem } from "../problemDetails.js";
import { routeParameter } from "../routeParameter.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: GEOGRAPHIC_LAYER_MAX_FILE_BYTES } });
const gzipAsync = promisify(gzip);

/** Geographic layer routes, mounted under /api/resources before the generic resource routes. */
// @implements-requirement HALL-FR-DOC-310
// @implements-requirement HALL-FR-DOC-320
// @implements-requirement HALL-FR-DOC-330
// @implements-requirement HALL-FR-DOC-390
// @implements-requirement HALL-FR-DOC-400
export function createGeographicLayersRouter({ geographicLayerService, requestContext }: Cradle): Router {
  const router = Router();
  const requireBusinessUpdate = requirePermission("council-business.update");
  const requireBusinessUpdateForContext = (request: Request, response: Response, next: NextFunction): void => {
    if (request.body?.councilBusinessId) {
      requireBusinessUpdate(request, response, next);
      return;
    }
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

  router.get("/geographic-layers", requirePermission("workspace.read"), async (_request, response) => {
    response.json(await geographicLayerService.list());
  });

  router.post(
    "/geographic-layers/import",
    requireActionPermission("resource.import-geographic-layer"),
    uploadFile,
    requireBusinessUpdateForContext,
    async (request, response) => {
      if (!request.file) throw new DomainError("invalid_request");
      const name = request.body.name
        ? String(request.body.name)
        : basename(request.file.originalname, extname(request.file.originalname));
      try {
        response.status(201).json(
          await geographicLayerService.importLayer({
            path: resourcePathSchema.parse(request.body.path ?? ""),
            name,
            fileName: request.file.originalname,
            content: request.file.buffer,
            councilBusinessId: resourceIdSchema.optional().parse(request.body.councilBusinessId || undefined),
            geographicResourceId: resourceIdSchema.optional().parse(request.body.geographicResourceId || undefined),
          }),
        );
      } catch (error) {
        if (error instanceof GeographicLayerImportError) {
          sendProblem(request, response, 422, "geographic_layer_invalid", { errors: error.issues });
          return;
        }
        throw error;
      }
    },
  );

  router.get(
    "/geographic-layers/municipal-property",
    requirePermission("workspace.read"),
    async (_request, response) => {
      response.json(await geographicLayerService.municipalProperty());
    },
  );

  router.post(
    "/geographic-layers/municipal-property/import",
    requireActionPermission("resource.import-municipal-property"),
    uploadFile,
    async (request, response) => {
      const input = importMunicipalPropertySchema.parse({
        label: request.body.label,
        ...(request.body.list ? { list: String(request.body.list) } : {}),
      });
      const text = [request.file?.buffer.toString("utf8") ?? "", input.list ?? ""].join("\n");
      const result = await geographicLayerService.importMunicipalProperty({
        label: input.label,
        fileName: request.file?.originalname ?? null,
        text,
        importerName: request.principal?.displayName ?? "Hall",
      });
      if (!("links" in result)) {
        sendProblem(request, response, 422, "municipal_property_empty", { errors: result.rejected.slice(0, 200) });
        return;
      }
      response.status(201).json(result);
    },
  );

  router.get("/:reference/feature-notes", requirePermission("workspace.read"), async (request, response) => {
    response.json(
      await geographicLayerService.notes(resourceReferenceSchema.parse(routeParameter(request.params.reference))),
    );
  });

  router.post(
    "/:reference/feature-notes",
    requireActionPermission("resource.create-geographic-feature-note"),
    async (request, response) => {
      const note = await geographicLayerService.createNote(
        resourceReferenceSchema.parse(routeParameter(request.params.reference)),
        createGeographicFeatureNoteSchema.parse(request.body).position,
      );
      response.status(201).json({
        class: ["geographic-feature-note"],
        properties: note,
        links: [{ rel: ["note"], href: `/api/resources/${encodeURIComponent(note.slug)}` }],
      });
    },
  );

  router.get("/:reference/features", requirePermission("workspace.read"), async (request, response) => {
    const features = await geographicLayerService.features(
      resourceReferenceSchema.parse(routeParameter(request.params.reference)),
    );
    const gzipped = request.acceptsEncodings("gzip", "identity") === "gzip";
    response.setHeader("ETag", `"${features.layerId}.${features.version}${gzipped ? ".gz" : ""}"`);
    response.setHeader("Cache-Control", "private, no-cache");
    response.setHeader("Vary", "Accept-Encoding");
    if (request.fresh) {
      response.status(304).end();
      return;
    }
    const body = Buffer.from(await features.readText(), "utf8");
    response.type("application/geo+json");
    if (gzipped) {
      response.setHeader("Content-Encoding", "gzip");
      response.send(await gzipAsync(body));
      return;
    }
    response.send(body);
  });

  router.put(
    "/:reference/overlays",
    requireActionPermission("resource.link-geographic-layer"),
    async (request, response) => {
      response.json(
        await geographicLayerService.link(
          resourceReferenceSchema.parse(routeParameter(request.params.reference)),
          linkGeographicLayerSchema.parse(request.body),
        ),
      );
    },
  );

  router.post(
    "/:reference/overlays/unlink",
    requireActionPermission("resource.unlink-geographic-layer"),
    async (request, response) => {
      response.json(
        await geographicLayerService.unlink(
          resourceReferenceSchema.parse(routeParameter(request.params.reference)),
          unlinkGeographicLayerSchema.parse(request.body).layerId,
        ),
      );
    },
  );

  return router;
}
