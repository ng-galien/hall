import type { ReactElement } from "react";
import { ColorPicker } from "@/components/ui/color-picker";
import { standardColorPresets } from "@/components/ui/color-presets";
import { useI18n } from "../../i18n/I18nProvider";
import type { ApiErrorCode } from "../../services/apiClient";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";

/**
 * Records the shared colour of a folder through its metadata action; null removes it.
 * Returns the refusal, or null once recorded.
 * @implements-requirement HALL-FR-WSP-480
 */
export async function changeFolderColor(folderId: string, color: string | null): Promise<ApiErrorCode | null> {
  const store = useWorkspaceResourcesStore.getState();
  const folder = store.summaries[folderId] ?? store.details[folderId] ?? (await store.open(folderId))?.data;
  if (folder?.kind !== "folder") return null;
  const updated = await useWorkspaceResourcesStore.getState().updateMetadata(folderId, {
    path: folder.path,
    name: folder.name,
    tags: folder.tags,
    color,
    editing: { kind: "fixed" },
  });
  return updated ? null : useWorkspaceResourcesStore.getState().error;
}

/**
 * The shared colour picker of a folder, opened beside the folder icon given as `anchor`.
 * @implements-requirement HALL-FR-WSP-480
 */
export function FolderColorPicker({
  folderId,
  color,
  anchor,
  onClose,
  onError,
}: {
  folderId: string;
  color: string | null;
  anchor: ReactElement;
  onClose(): void;
  onError(error: ApiErrorCode | null): void;
}) {
  const { t } = useI18n();
  const change = async (next: string | null) => {
    onError(null);
    onError(await changeFolderColor(folderId, next));
  };
  return (
    <ColorPicker
      anchor={anchor}
      open
      value={color ?? ""}
      presets={standardColorPresets(t)}
      ariaLabel={t("workspace.folderColor")}
      customLabel={t("geographic.color.custom")}
      clearLabel={t("workspace.folderColorClear")}
      closeLabel={t("common.close")}
      live
      testId="workspace-folder-color-picker"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onValueChange={(value) => void change(value)}
      onClear={() => void change(null)}
    />
  );
}
