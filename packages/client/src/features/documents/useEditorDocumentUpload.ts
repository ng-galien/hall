import { findSirenAction, type SirenEntity } from "@hall/api-contract";
import { useContext, useMemo } from "react";
import type { EditorDocumentUpload } from "../../components/editor/imageTransfer";
import { ReferenceBusinessContext } from "../../hooks/useReferenceMentionables";
import { convertSpreadsheetTable } from "../../services/resourcesApi";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";

/** Extensions listed by the file field of an upload action; null when the action is absent, "any" when it lists none. */
function acceptedExtensions(
  representation: SirenEntity,
  name: "resource.create-document" | "resource.import-spreadsheet",
): string[] | "any" | null {
  const action = findSirenAction(representation, name);
  if (!action) return null;
  const accept = action.fields?.find((field) => field.name === "file")?.accept;
  if (!accept) return "any";
  return accept
    .split(",")
    .map((extension) => extension.trim().toLowerCase())
    .filter(Boolean);
}

function extensionOf(file: File) {
  const dot = file.name.lastIndexOf(".");
  return dot < 0 ? "" : file.name.slice(dot).toLowerCase();
}

// @implements-requirement HALL-FR-DOC-500
// @implements-requirement HALL-FR-DOC-510
/**
 * Uploads a file dropped into a text editor with the upload actions of « Importer un fichier »: in a council business,
 * as a document of the business in its folder; elsewhere, as a document of the folder of the edited text. The accepted
 * formats are those of the actions; undefined when the user may not upload there. The business is the given one, or
 * the business of the surrounding view.
 */
export function useEditorDocumentUpload(
  folderPath: string | undefined,
  councilBusinessId?: string,
): EditorDocumentUpload | undefined {
  const inheritedBusinessId = useContext(ReferenceBusinessContext);
  const businessId = councilBusinessId ?? inheritedBusinessId;
  const business = useCouncilBusinessStore((state) =>
    businessId ? state.businesses.find(({ id }) => id === businessId) : undefined,
  );
  const businessRepresentation = useCouncilBusinessStore((state) =>
    businessId ? state.representationsById[businessId] : undefined,
  );
  const collectionRepresentation = useWorkspaceResourcesStore((state) => state.collectionRepresentation);
  const representation = businessId ? businessRepresentation : collectionRepresentation;
  const path = business ? business.folderPath : folderPath;

  return useMemo(() => {
    if (!representation || path === undefined || (businessId && !business)) return undefined;
    const documents = acceptedExtensions(representation, "resource.create-document");
    const spreadsheetList = acceptedExtensions(representation, "resource.import-spreadsheet");
    const spreadsheets = Array.isArray(spreadsheetList) ? spreadsheetList : [];
    if (!documents && !spreadsheets.length) return undefined;
    const isSpreadsheet = (file: File) => spreadsheets.includes(extensionOf(file));
    const converts = Boolean(findSirenAction(representation, "resource.convert-spreadsheet-table"));
    const isDocument = (file: File) =>
      documents === "any" || Boolean(documents?.includes(extensionOf(file)));
    return {
      accepts: (file) => isSpreadsheet(file) || isDocument(file),
      accepted: [...(Array.isArray(documents) ? documents : []), ...spreadsheets].join(", "),
      convertsToTable: (file) => converts && isSpreadsheet(file),
      async convertTable(file) {
        const form = new FormData();
        form.set("file", file);
        return convertSpreadsheetTable(representation, form);
      },
      async upload(file) {
        const spreadsheet = isSpreadsheet(file);
        const form = new FormData();
        if (business) form.set("councilBusinessId", business.id);
        form.set("path", path);
        form.set("name", spreadsheet ? file.name.slice(0, -extensionOf(file).length) : file.name);
        form.set("file", file);
        const resources = useWorkspaceResourcesStore.getState();
        const created = spreadsheet
          ? await resources.importSpreadsheet(form, representation)
          : await resources.uploadDocument(form, representation);
        if (!created) throw new Error(useWorkspaceResourcesStore.getState().error ?? "request_failed");
        if (business) await useCouncilBusinessStore.getState().loadResources(business.id);
        return { id: created.id, label: created.name };
      },
    } satisfies EditorDocumentUpload;
  }, [business, businessId, path, representation]);
}
