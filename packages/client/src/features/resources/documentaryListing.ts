import type { ResourceSummary } from "@hall/api-contract";

// @implements-requirement HALL-FR-DOC-200
export function isListedInDocuments(resource: Pick<ResourceSummary, "kind" | "hiddenInDocuments">) {
  return resource.kind !== "event" && resource.hiddenInDocuments !== true;
}
