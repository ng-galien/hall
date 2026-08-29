import { findSirenAction } from "@hall/api-contract";
import { apiPathFromHref, apiResponse, SirenCapabilityUnavailable, sirenRepresentation } from "./apiClient";

/** Renders ad hoc Markdown to a PDF blob through the Siren template preview action. */
export async function previewTemplatePdf(bodyMarkdown: string): Promise<Blob> {
  const representation = await sirenRepresentation("/templates");
  const action = findSirenAction(representation, "template.preview-pdf");
  if (!action) throw new SirenCapabilityUnavailable("template.preview-pdf");
  const response = await apiResponse(apiPathFromHref(action.href), {
    method: action.method,
    headers: { Accept: "application/pdf" },
    body: JSON.stringify({ bodyMarkdown }),
  });
  return response.blob();
}
