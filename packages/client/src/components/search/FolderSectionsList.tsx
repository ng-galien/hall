import type { ReactNode } from "react";
import { FolderGlyph } from "../../features/documents/FolderGlyph";
import { ListRow, ListRows } from "../ui/list-row";
import type { FolderSection } from "./folderSections";
import "./FolderSectionsList.css";

/* Renders search results as the workspace tree: one folder row per section, its items and sub-folders under it.
   `renderItem` receives the flat row index in display order so surfaces can drive keyboard navigation. */

export function FolderSectionsList<T>({
  sections,
  renderItem,
  itemKey,
  onFolderSelect,
}: {
  sections: FolderSection<T>[];
  renderItem(item: T, index: number): ReactNode;
  itemKey(item: T): string;
  onFolderSelect?(path: string): void;
}) {
  let index = -1;
  const renderNode = (node: FolderSection<T>): ReactNode => {
    const items = node.items.flatMap((item) => {
      index += 1;
      const rendered = renderItem(item, index);
      return rendered ? [<li key={itemKey(item)}>{rendered}</li>] : [];
    });
    const branch =
      items.length || node.children.length ? (
        <ul className="folder-sections-branch">
          {items}
          {node.children.map(renderNode)}
        </ul>
      ) : undefined;
    const row = { head: node.folder ? <FolderGlyph open /> : undefined, title: node.label, children: branch };
    return onFolderSelect && node.folder ? (
      <ListRow
        {...row}
        key={node.key}
        onOpen={() => onFolderSelect(node.path)}
        openTestId={`search-folder-${node.path}`}
      />
    ) : (
      <ListRow {...row} key={node.key} />
    );
  };
  return <ListRows className="folder-sections-list">{sections.map(renderNode)}</ListRows>;
}
