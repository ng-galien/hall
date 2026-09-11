import { councilBusinessSchema, findSirenAction } from "@hall/api-contract";
import {
  apiPathFromHref,
  apiResponse,
  SirenCapabilityUnavailable,
  sirenRepresentation,
  submitSirenActionAt,
} from "./apiClient";

export async function exportCouncilBusinessBundle(id: string, sender: { firstName: string; lastName: string }) {
  const representation = await sirenRepresentation(`/council-business/${encodeURIComponent(id)}`);
  const action = findSirenAction(representation, "council-business.export-bundle");
  if (!action) throw new SirenCapabilityUnavailable("council-business.export-bundle");
  const response = await apiResponse(`${apiPathFromHref(action.href)}?${new URLSearchParams(sender)}`);
  const url = URL.createObjectURL(await response.blob());
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = "affaire.hallbundle";
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function importCouncilBusinessBundle(file: File) {
  const form = new FormData();
  form.append("file", file);
  const result = await submitSirenActionAt<unknown>("/council-business", "council-business.import-bundle", form);
  return councilBusinessSchema.parse(result.data);
}
