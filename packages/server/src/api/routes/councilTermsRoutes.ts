import { configureCouncilTermSchema } from "@hall/api-contract";
import { Router } from "express";
import type { Cradle } from "../../core/container.js";
import { requirePermission } from "../../security/authorization.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";

/** Active CouncilTerm collection. Its PostgreSQL invariant permits at most one current term. */
export function createCouncilTermsRouter({ directoryService }: Cradle): Router {
  const router = Router();
  router.get("/", requirePermission("meetings.read"), async (_request, response) => {
    const active = await directoryService.getActiveCouncilTerm();
    response.json(active ? [active] : []);
  });
  router.put("/", requireActionPermission("council-term.configure"), async (request, response) => {
    const input = configureCouncilTermSchema.parse(request.body);
    response.json(await directoryService.configureActiveCouncilTerm(input.expectedMemberCount));
  });
  return router;
}
