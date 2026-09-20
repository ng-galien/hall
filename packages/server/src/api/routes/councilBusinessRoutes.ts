import {
  associateCouncilBusinessResourceSchema,
  changeCouncilBusinessCommitteeSchema,
  councilBusinessAgendaHistoryQuerySchema,
  createCouncilBusinessSchema,
  createPreparedCouncilSubjectSchema,
  dissociateCouncilBusinessResourceSchema,
  preparedCouncilSubjectKindSchema,
  reorderCouncilBusinessResourcesSchema,
  scheduleCouncilBusinessSubjectSchema,
} from "@hall/api-contract";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { Cradle } from "../../core/container.js";
import { slugify } from "../../repositories/publicIdentifiers.js";
import { requirePermission } from "../../security/authorization.js";
import { DomainError } from "../../services/errors.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";
import { committeeLinkCollection, committeeLinkResult } from "../councilBusinessCommitteeRepresentation.js";
import { routeParameter } from "../routeParameter.js";

export function createCouncilBusinessRouter({
  councilBusinessWorkspaceService,
  councilClient,
  councilBusinessBundleExportService,
  councilBusinessBundleImportService,
  requestContext,
}: Cradle): Router {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 64 * 1024 * 1024, files: 1 } });
  const uploadBundle: ReturnType<typeof upload.single> = (request, response, next) => {
    const context = requestContext.current();
    upload.single("file")(request, response, (error) => {
      const resume = () => (error ? next(error) : next());
      if (context) requestContext.run(context, resume);
      else resume();
    });
  };
  router.post(
    "/import-bundle",
    requireActionPermission("council-business.import-bundle"),
    uploadBundle,
    async (request, response) => {
      if (!request.file) throw new DomainError("invalid_request");
      response.status(201).json(await councilBusinessBundleImportService.import(request.file.buffer));
    },
  );
  router.get(
    "/:businessId/bundle",
    requireActionPermission("council-business.export-bundle"),
    async (request, response) => {
      const sender = z
        .object({ firstName: z.string().trim().min(1).max(200), lastName: z.string().trim().min(1).max(200) })
        .parse(request.query);
      const bytes = await councilBusinessBundleExportService.export(routeParameter(request.params.businessId), {
        ...sender,
        slug: slugify(`${sender.lastName} ${sender.firstName}`),
      });
      response.setHeader("Content-Type", "application/gzip");
      response.setHeader("Content-Disposition", 'attachment; filename="affaire.hallbundle"');
      response.send(bytes);
    },
  );

  router.delete("/:businessId", requireActionPermission("council-business.delete"), async (request, response) => {
    response.json(await councilBusinessWorkspaceService.delete(z.string().uuid().parse(request.params.businessId)));
  });

  router.get("/prepared-subjects", requirePermission("workspace.read"), async (request, response) => {
    const meetingId = z.string().uuid().optional().parse(request.query.councilMeetingId);
    const businessId = z.string().uuid().optional().parse(request.query.councilBusinessId);
    response.json(await councilClient.listPreparedSubjects(meetingId, businessId));
  });
  router.get("/prepared-subjects/:kind/:id", requirePermission("workspace.read"), async (request, response) => {
    const kind = preparedCouncilSubjectKindSchema.parse(request.params.kind);
    const subject = await councilClient.openPreparedSubject(routeParameter(request.params.id), kind);
    if (!subject) throw new DomainError("prepared_subject_not_found", 404);
    response.json(subject);
  });
  router.post(
    "/:businessId/prepared-subjects",
    requireActionPermission("council-business.create-prepared-subject"),
    async (request, response) => {
      response
        .status(201)
        .json(
          await councilClient.createPreparedSubject(
            routeParameter(request.params.businessId),
            createPreparedCouncilSubjectSchema.parse(request.body),
          ),
        );
    },
  );

  router.get("/", requirePermission("workspace.read"), async (_request, response) => {
    const businesses = await councilBusinessWorkspaceService.list();
    response.locals.currentCouncilBusinessAgendaItems =
      businesses.length === 0
        ? []
        : await councilBusinessWorkspaceService.listAgendaItems(businesses.map(({ id }) => id));
    response.json(businesses);
  });

  router.get("/workspace-items", requirePermission("workspace.read"), async (_request, response) => {
    response.json(await councilBusinessWorkspaceService.listWorkspaceItems());
  });

  router.get("/resource-items", requirePermission("workspace.read"), async (request, response) => {
    const rawIds = request.query.councilBusinessId;
    const councilBusinessIds = Array.isArray(rawIds) ? rawIds : rawIds === undefined ? [] : [rawIds];
    const query = councilBusinessAgendaHistoryQuerySchema.parse({ councilBusinessIds });
    response.json(await councilBusinessWorkspaceService.listResourceItems(query.councilBusinessIds));
  });

  router.post("/", requireActionPermission("council-business.create"), async (request, response) => {
    const created = await councilBusinessWorkspaceService.create(createCouncilBusinessSchema.parse(request.body));
    response.status(201).json(created);
  });

  router.get("/agenda-items", requirePermission("meetings.read"), async (request, response) => {
    const rawIds = request.query.councilBusinessId;
    const councilBusinessIds = Array.isArray(rawIds) ? rawIds : rawIds === undefined ? [] : [rawIds];
    const query = councilBusinessAgendaHistoryQuerySchema.parse({ councilBusinessIds });
    response.json(await councilBusinessWorkspaceService.listAgendaItems(query.councilBusinessIds));
  });

  router.get("/:businessId", requirePermission("workspace.read"), async (request, response) => {
    const business = await councilBusinessWorkspaceService.get(routeParameter(request.params.businessId));
    response.locals.currentCouncilBusinessAgendaItems = await councilBusinessWorkspaceService.listAgendaItems([
      business.id,
    ]);
    response.json(business);
  });

  router.get("/:businessId/resources", requirePermission("workspace.read"), async (request, response) => {
    const businessId = routeParameter(request.params.businessId);
    await councilBusinessWorkspaceService.get(businessId);
    response.json(await councilBusinessWorkspaceService.listResources(businessId));
  });

  router.get("/:businessId/committees", requirePermission("workspace.read"), async (request, response) => {
    const businessId = routeParameter(request.params.businessId);
    await councilBusinessWorkspaceService.get(businessId);
    response.json(
      committeeLinkCollection(
        `/api/council-business/${businessId}/committees`,
        await councilBusinessWorkspaceService.listCommittees(businessId),
      ),
    );
  });

  router.post(
    "/:businessId/committees",
    requireActionPermission("council-business.associate-committee"),
    async (request, response) => {
      const businessId = routeParameter(request.params.businessId);
      await councilBusinessWorkspaceService.get(businessId);
      const { committeeId } = changeCouncilBusinessCommitteeSchema.parse(request.body);
      const linked = await councilBusinessWorkspaceService.associateCommittee(businessId, committeeId);
      response.status(201).json(committeeLinkResult(`/api/council-business/${businessId}/committees`, linked));
    },
  );

  router.post(
    "/:businessId/committees/dissociate",
    requireActionPermission("council-business.dissociate-committee"),
    async (request, response) => {
      const businessId = routeParameter(request.params.businessId);
      await councilBusinessWorkspaceService.get(businessId);
      const { committeeId } = changeCouncilBusinessCommitteeSchema.parse(request.body);
      const unlinked = await councilBusinessWorkspaceService.dissociateCommittee(businessId, committeeId);
      response.json(committeeLinkResult(`/api/council-business/${businessId}/committees`, unlinked));
    },
  );

  router.post(
    "/:businessId/resources",
    requireActionPermission("council-business.associate-resource"),
    async (request, response) => {
      const businessId = routeParameter(request.params.businessId);
      await councilBusinessWorkspaceService.get(businessId);
      const input = associateCouncilBusinessResourceSchema.parse(request.body);
      response.status(201).json(await councilBusinessWorkspaceService.associateResource(businessId, input.resourceId));
    },
  );

  router.post(
    "/:businessId/resources/dissociate",
    requireActionPermission("council-business.dissociate-resource"),
    async (request, response) => {
      const businessId = routeParameter(request.params.businessId);
      await councilBusinessWorkspaceService.get(businessId);
      const input = dissociateCouncilBusinessResourceSchema.parse(request.body);
      response.json(await councilBusinessWorkspaceService.dissociateResource(businessId, input.resourceId));
    },
  );

  router.put(
    "/:businessId/resource-order",
    requireActionPermission("council-business.reorder-resources"),
    async (request, response) => {
      const businessId = routeParameter(request.params.businessId);
      await councilBusinessWorkspaceService.get(businessId);
      response.json(
        await councilBusinessWorkspaceService.reorderResources(
          businessId,
          reorderCouncilBusinessResourcesSchema.parse(request.body),
        ),
      );
    },
  );

  router.post(
    "/:businessId/agenda-items/council-decision-proposals",
    requireActionPermission("council-business.schedule-decision-proposal"),
    async (request, response) => {
      const businessId = routeParameter(request.params.businessId);
      await councilBusinessWorkspaceService.get(businessId);
      response
        .status(201)
        .json(
          await councilBusinessWorkspaceService.scheduleDecisionProposal(
            businessId,
            scheduleCouncilBusinessSubjectSchema.parse(request.body),
          ),
        );
    },
  );

  router.post(
    "/:businessId/agenda-items/open-questions",
    requireActionPermission("council-business.schedule-open-question"),
    async (request, response) => {
      const businessId = routeParameter(request.params.businessId);
      await councilBusinessWorkspaceService.get(businessId);
      response
        .status(201)
        .json(
          await councilBusinessWorkspaceService.scheduleOpenQuestion(
            businessId,
            scheduleCouncilBusinessSubjectSchema.parse(request.body),
          ),
        );
    },
  );

  return router;
}
