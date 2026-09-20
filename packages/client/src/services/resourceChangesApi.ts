import { resourceChangesSchema, type ResourceChanges, type SirenEntity } from "@hall/api-contract";
import { followSirenLink } from "./apiClient";

export async function openResourceChanges(representation: SirenEntity): Promise<ResourceChanges> {
  const result = await followSirenLink<unknown>(representation, "changes");
  return resourceChangesSchema.parse(result.data);
}
