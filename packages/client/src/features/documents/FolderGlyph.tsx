import { FolderIcon, FolderOpenIcon } from "../../components/icons";

/** Folder badge shared by every tree and list that shows folders. */
export function FolderGlyph({ open = false }: { open?: boolean }) {
  return (
    <span className="workspace-glyph workspace-glyph-folder" aria-hidden="true">
      {open ? <FolderOpenIcon /> : <FolderIcon />}
    </span>
  );
}
