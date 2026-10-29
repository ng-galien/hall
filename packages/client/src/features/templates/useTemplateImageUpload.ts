import { useCallback, useEffect } from "react";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";

/** Workspace folder that keeps the images cited by document templates. */
export const templateImagesFolder = "Modèles de documents";

/**
 * Imports an image chosen in a template body as a file of the templates folder, created on first use, so that the
 * PDF engine finds it as a JPEG or PNG file cited by `::image`.
 */
// @implements-requirement HALL-FR-DOC-580
export function useTemplateImageUpload() {
  const canUpload = useWorkspaceResourcesStore((state) => state.collectionCapabilities.uploadDocument);
  const catalogLoaded = useWorkspaceResourcesStore((state) => state.collectionRepresentation !== null);
  useEffect(() => {
    if (!catalogLoaded) void useWorkspaceResourcesStore.getState().loadCatalog();
  }, [catalogLoaded]);
  const upload = useCallback(async (image: File) => {
    const store = useWorkspaceResourcesStore.getState();
    if (!store.collectionRepresentation) await store.loadCatalog();
    const folderExists = Object.values(useWorkspaceResourcesStore.getState().summaries).some(
      (summary) => summary.kind === "folder" && summary.fullPath === templateImagesFolder,
    );
    if (!folderExists && !(await store.create({ kind: "folder", path: "", name: templateImagesFolder }))) {
      throw new Error(useWorkspaceResourcesStore.getState().error ?? "request_failed");
    }
    const form = new FormData();
    form.set("path", templateImagesFolder);
    form.set("name", image.name);
    form.set("file", image);
    const created = await useWorkspaceResourcesStore.getState().uploadDocument(form);
    if (!created) throw new Error(useWorkspaceResourcesStore.getState().error ?? "request_failed");
    return { id: created.id, label: created.name };
  }, []);
  return { canUpload, upload };
}
