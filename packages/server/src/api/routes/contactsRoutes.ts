import { createContactSchema, updateContactSchema } from "@hall/domain";
import { Router } from "express";
import type { Cradle } from "../../core/container.js";
import { requirePermission } from "../../security/authorization.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";
import { routeParameter } from "../routeParameter.js";

export function createContactsRouter({ contactService }: Cradle): Router {
  const router = Router();
  router.get("/", requirePermission("contacts.read"), async (request, response) => {
    response.json(await contactService.list(request.query.includeArchived === "true"));
  });
  router.get("/:contactId", requirePermission("contacts.read"), async (request, response) => {
    response.json(await contactService.get(routeParameter(request.params.contactId)));
  });
  router.post("/", requireActionPermission("contact.create"), async (request, response) => {
    response.status(201).json(await contactService.create(createContactSchema.parse(request.body)));
  });
  router.put("/:contactId", requireActionPermission("contact.update"), async (request, response) => {
    response.json(
      await contactService.update(routeParameter(request.params.contactId), updateContactSchema.parse(request.body)),
    );
  });
  router.post("/:contactId/archive", requireActionPermission("contact.archive"), async (request, response) => {
    response.json(await contactService.archive(routeParameter(request.params.contactId)));
  });
  return router;
}
