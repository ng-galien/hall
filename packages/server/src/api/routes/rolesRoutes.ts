import { randomUUID } from "node:crypto";
import {
  type AuthorizationConfiguration,
  type AuthorizationRole,
  authorizationRoleInputSchema,
  SIREN_MEDIA_TYPE,
  type SirenEmbeddedEntity,
  type SirenEntity,
} from "@hall/api-contract";
import { Router } from "express";
import { z } from "zod";
import type { Cradle } from "../../core/container.js";
import { requireAction } from "../../security/authorization.js";
import { DomainError } from "../../services/errors.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";
import { routeParameter } from "../routeParameter.js";

// @implements-requirement HALL-FR-USR-060
export function createRolesRouter({ authorizationAdministrationClient }: Cradle): Router {
  const router = Router();
  router.get("/options", async (_request, response) => {
    const options = await authorizationAdministrationClient.roleOptions();
    response.json({
      class: ["role-options"],
      properties: { items: options },
      links: [{ rel: ["self"], href: "/api/roles/options", type: SIREN_MEDIA_TYPE }],
    });
  });
  router.get("/", requireAction("role.list"), async (_request, response) => {
    const config = await authorizationAdministrationClient.configuration();
    const representation: SirenEntity<AuthorizationConfiguration> = {
      class: ["authorization-configuration"],
      properties: config,
      actions: [{ name: "role.create", method: "POST", href: "/api/roles", type: "application/json" }],
      entities: config.roles.map(roleRepresentation),
      links: [{ rel: ["self"], href: "/api/roles", type: SIREN_MEDIA_TYPE }],
    };
    response.json(representation);
  });
  router.get("/:id", requireAction("role.list"), async (request, response) => {
    const config = await authorizationAdministrationClient.configuration();
    const role = config.roles.find((role) => role.id === routeParameter(request.params.id));
    if (!role) throw new DomainError("resource_not_found", 404);
    response.json(roleRepresentation(role));
  });
  router.post("/", requireActionPermission("role.create"), async (request, response) => {
    const input = authorizationRoleInputSchema.parse(request.body);
    if (input.revision !== 0)
      throw new z.ZodError([{ code: "custom", path: ["revision"], message: "A new role has revision zero" }]);
    response.status(201).json(await authorizationAdministrationClient.saveRole(`role-${randomUUID()}`, input));
  });
  router.put("/:id", requireActionPermission("role.update"), async (request, response) => {
    response.json(
      await authorizationAdministrationClient.saveRole(
        routeParameter(request.params.id),
        authorizationRoleInputSchema.parse(request.body),
      ),
    );
  });
  router.delete("/:id", requireActionPermission("role.delete"), async (request, response) => {
    const { revision } = z.object({ revision: z.number().int().positive() }).strict().parse(request.body);
    await authorizationAdministrationClient.deleteRole(routeParameter(request.params.id), revision);
    response.status(204).end();
  });
  return router;
}

function roleRepresentation(role: AuthorizationRole): SirenEmbeddedEntity {
  return {
    class: ["authorization-role"],
    rel: ["item"],
    properties: role,
    actions: role.builtIn
      ? []
      : [
          { name: "role.update", method: "PUT", href: `/api/roles/${role.id}`, type: "application/json" },
          { name: "role.delete", method: "DELETE", href: `/api/roles/${role.id}`, type: "application/json" },
        ],
    links: [{ rel: ["self"], href: `/api/roles/${role.id}`, type: SIREN_MEDIA_TYPE }],
  };
}
