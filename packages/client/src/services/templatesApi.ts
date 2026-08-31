import { findSirenAction } from "@hall/api-contract";
import { apiPathFromHref, apiRequest, SirenCapabilityUnavailable, sirenRepresentation } from "./apiClient";

/** Renders ad hoc Markdown and returns a navigable URL for the native PDF viewer. */
export async function previewTemplatePdf(bodyMarkdown: string): Promise<string> {
  const representation = await sirenRepresentation("/templates");
  const action = findSirenAction(representation, "template.preview-pdf");
  if (!action) throw new SirenCapabilityUnavailable("template.preview-pdf");
  const preview = await apiRequest<{ url: string }>(`${apiPathFromHref(action.href)}?delivery=url`, {
    method: action.method,
    body: JSON.stringify({ bodyMarkdown }),
  });
  return preview.url;
}
