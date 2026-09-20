import { saveContactSchema } from "@hall/api-contract";
import { Router } from "express";
import type { Cradle } from "../../core/container.js";
import { requirePermission } from "../../security/authorization.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";
import { routeParameter } from "../routeParameter.js";

export function createContactsRouter({ directoryService }: Cradle): Router {
  const router = Router();
  router.get("/", requirePermission("contacts.read"), async (request, response) => {
    const [contacts, activeMembers] = await Promise.all([
      directoryService.listContacts(request.query.includeArchived === "true"),
      directoryService.listCouncilMembers(true),
    ]);
    response.locals.contactArchiveUnavailableIds = new Set(activeMembers.map(({ contactId }) => contactId));
    response.json(contacts);
  });
  router.get("/:contactId", requirePermission("contacts.read"), async (request, response) => {
    const contactId = routeParameter(request.params.contactId);
    const [contact, activeMembers] = await Promise.all([
      directoryService.getContact(contactId),
      directoryService.listCouncilMembers(true),
    ]);
    response.locals.contactArchiveUnavailableIds = new Set(activeMembers.map(({ contactId }) => contactId));
    response.json(contact);
  });
  router.post("/", requireActionPermission("contact.create"), async (request, response) => {
    response.status(201).json(await directoryService.createContact(saveContactSchema.parse(request.body)));
  });
  router.put("/:contactId", requireActionPermission("contact.update"), async (request, response) => {
    const contactId = routeParameter(request.params.contactId);
    const [contact, activeMembers] = await Promise.all([
      directoryService.updateContact(contactId, saveContactSchema.parse(request.body)),
      directoryService.listCouncilMembers(true),
    ]);
    response.locals.contactArchiveUnavailableIds = new Set(activeMembers.map(({ contactId }) => contactId));
    response.json(contact);
  });
  router.post("/:contactId/archive", requireActionPermission("contact.archive"), async (request, response) => {
    response.json(await directoryService.archiveContact(routeParameter(request.params.contactId)));
  });
  return router;
}
