import {
  type CouncilBusinessReorganizationPlan,
  SIREN_MEDIA_TYPE,
  type SirenAction,
  type SirenEntity,
  type SirenLink,
} from "@hall/api-contract";
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

function textAt(value: unknown, ...path: string[]): string | null {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current !== "" ? current : null;
}

/** A subject move or business merge plan, linked only to the objects that exist once the gesture is done. */
export function councilBusinessReorganizationRepresentation(
  gesture: "moveSubject" | "mergeBusiness",
  plan: CouncilBusinessReorganizationPlan,
): SirenEntity {
  const link = (rel: string[], href: string): SirenLink => ({ rel, href, type: SIREN_MEDIA_TYPE });
  const target = `/api/council-business/${plan.to.id}`;
  const links: SirenLink[] = [link(["self"], target), link(["to"], target)];
  if (gesture === "moveSubject" || !plan.applied) links.push(link(["from"], `/api/council-business/${plan.from.id}`));
  if (gesture === "moveSubject") {
    const kind = textAt(plan, "kind");
    const subjectId = textAt(plan, "subjectId");
    const textResourceId = textAt(plan, "text", "resourceId");
    if (kind && subjectId)
      links.push(link(["subject"], `/api/council-business/prepared-subjects/${kind}/${subjectId}`));
    if (textResourceId) links.push(link(["content-resource"], `/api/resources/${textResourceId}`));
  } else {
    const reportId = textAt(plan, "report", "targetReportResourceId");
    if (reportId) links.push(link(["report"], `/api/resources/${reportId}`));
  }
  return { class: ["council-business-reorganization"], properties: plan, links };
}
