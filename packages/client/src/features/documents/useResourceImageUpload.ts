import type { EditorAssetOwner } from "@hall/domain";
import { useCallback } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { useResourcesStore } from "../../stores/resourcesStore";

export interface UploadedResourceImage {
  id: string;
  label: string;
}

const acceptedImageTypes = new Set(["image/jpeg", "image/png"]);

/** Builds a display title from a file name; technical names fall back to a generic label. */
export function imageUploadTitle(fileName: string, fallback = "Imported image"): string {
  const stem = fileName.replace(/\.[^.]+$/, "").trim();
  if (!stem || /^(?:codex-clipboard|clipboard|image|img)[-_]?(?:[0-9a-f-]{8,})?$/i.test(stem)) {
    return fallback;
  }
  const words = stem.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return words ? `${words.charAt(0).toLocaleUpperCase()}${words.slice(1)}` : fallback;
}

/** Display title for an image, falling back to the file name when the stored title is a technical id. */
export function imagePresentationTitle(title: string, fileName: string, fallback = "Imported image"): string {
  const trimmed = title.trim();
  if (
    /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(trimmed) ||
    /^(?:codex-clipboard|clipboard|image|img)[-_]?[0-9a-f-]{8,}/i.test(trimmed)
  ) {
    return imageUploadTitle(fileName, fallback);
  }
  return trimmed || imageUploadTitle(fileName, fallback);
}

/** Uploads a JPEG or PNG image into the owner's folder. */
export function useResourceImageUpload() {
  const { t } = useI18n();
  const canUpload = useResourcesStore((state) => state.canUploadEditorAsset);
  const upload = useResourcesStore((state) => state.uploadEditorAsset);

  const uploadImage = useCallback(
    async (file: File, owner: EditorAssetOwner): Promise<UploadedResourceImage> => {
      if (!acceptedImageTypes.has(file.type)) throw new Error("unsupported_image_type");
      const form = new FormData();
      form.set("title", imageUploadTitle(file.name, t("editor.imageImported")));
      form.set("ownerKind", owner.kind);
      form.set("ownerId", owner.id);
      form.set("file", file);
      const created = await upload(form);
      if (created?.kind !== "document" || (created.format !== "jpeg" && created.format !== "png")) {
        throw new Error("image_upload_failed");
      }
      return { id: created.id, label: created.title };
    },
    [t, upload],
  );

  return { canUpload, uploadImage };
}
