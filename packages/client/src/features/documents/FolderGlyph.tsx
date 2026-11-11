import { FolderIcon, FolderOpenIcon } from "../../components/icons";
import { ListRowIcon } from "../../components/ui/list-row";
import { folderColorIconProps } from "../../pages/workspace/folderColor";

/** Folder icon shared by every tree and list that shows folders; a chosen colour replaces the grey. */
export function FolderGlyph({ open = false, color }: { open?: boolean; color?: string | null }) {
  const Icon = open ? FolderOpenIcon : FolderIcon;
  return (
    <ListRowIcon nature="folder">
      <Icon {...folderColorIconProps(color)} />
    </ListRowIcon>
  );
}
