import { useCallback } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { imageUploadTitle, type UploadedResourceImage } from "./useResourceImageUpload";

const acceptedImageTypes = new Set(["image/jpeg", "image/png"]);

/** Uploads an editor image owned by one canonical Workspace text resource. */
export function useWorkspaceResourceImageUpload() {
  const { t } = useI18n();
  const canUpload = useWorkspaceResourcesStore((state) => state.collectionCapabilities.createEditorAsset);
  const upload = useWorkspaceResourcesStore((state) => state.createEditorAsset);

  const uploadImage = useCallback(
    async (file: File, owner: { kind: "textResourceContent"; id: string }): Promise<UploadedResourceImage> => {
      if (!acceptedImageTypes.has(file.type)) throw new Error("unsupported_image_type");
      const form = new FormData();
      form.set("title", imageUploadTitle(file.name, t("editor.imageImported")));
      form.set("ownerKind", owner.kind);
      form.set("ownerId", owner.id);
      form.set("file", file);
      const created = await upload(form);
      if (!created) throw new Error("image_upload_failed");
      return { id: created.id, label: created.title };
    },
    [t, upload],
  );

  return { canUpload, uploadImage };
}
