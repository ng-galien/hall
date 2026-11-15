import { FolderIcon, FolderOpenIcon } from "../../components/icons";
import { PersonalFolderIcon, PersonalFolderOpenIcon } from "../../components/PersonalFolderIcon";
import { ListRowIcon } from "../../components/ui/list-row";
import { folderColorIconProps } from "../../pages/workspace/folderColor";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";

/** True when `path` is the personal folder of the connected person. */
export function useIsPersonalFolder(path: string | undefined) {
  const personalPath = useWorkspaceResourcesStore((state) => state.personalWorkspacePath);
  return path !== undefined && personalPath !== null && path === personalPath;
}

/** Folder icon, closed or open; the personal folder of the connected person is marked with a person. */
function folderIconFor(personal: boolean, open: boolean) {
  if (personal) return open ? PersonalFolderOpenIcon : PersonalFolderIcon;
  return open ? FolderOpenIcon : FolderIcon;
}

/**
 * Folder icon shared by every tree and list that shows folders; a chosen colour replaces the grey, and the personal
 * folder of the connected person, given by `path`, has its own icon.
 */
export function FolderGlyph({ open = false, color, path }: { open?: boolean; color?: string | null; path?: string }) {
  const personal = useIsPersonalFolder(path);
  const Icon = folderIconFor(personal, open);
  return (
    <ListRowIcon nature="folder">
      <Icon {...folderColorIconProps(color)} data-personal-folder={personal ? "true" : undefined} />
    </ListRowIcon>
  );
}
