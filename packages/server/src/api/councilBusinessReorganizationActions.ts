import type { SirenAction } from "@hall/api-contract";
import type { Request } from "express";
import { canExecute } from "../security/authorization.js";
import { action } from "./sirenActionPolicy.js";
import { primaryObject, publicReference, type SirenEntityClass } from "./sirenEntityIdentity.js";

const reorganizationFields = [
  { name: "targetCouncilBusinessId", type: "text" },
  { name: "preview", type: "checkbox", value: false },
];

/** Subject move and business merge, offered with a preview next to the other entity actions. */
export function councilBusinessReorganizationActions(
  request: Request,
  entityClass: SirenEntityClass,
  value: unknown,
): SirenAction[] {
  if (!value || typeof value !== "object") return [];
  const primary = primaryObject(entityClass, value);
  if (!primary || typeof primary.id !== "string") return [];
  if (entityClass === "prepared-subject") {
    if (typeof primary.kind !== "string" || !primary.agenda || !canExecute(request, "council-business.move-subject"))
      return [];
    return [
      {
        ...action(
          "council-business.move-subject",
          "POST",
          `/api/council-business/prepared-subjects/${primary.kind}/${primary.id}/move`,
          "Move the subject and its text to another council business",
        ),
        fields: reorganizationFields,
      },
    ];
  }
  if (entityClass === "council-business") {
    const reference = publicReference(entityClass, primary);
    if (!reference || !canExecute(request, "council-business.merge")) return [];
    return [
      {
        ...action(
          "council-business.merge",
          "POST",
          `/api/council-business/${reference}/merge`,
          "Merge this council business into another one, then remove it",
        ),
        fields: reorganizationFields,
      },
    ];
  }
  return [];
}
