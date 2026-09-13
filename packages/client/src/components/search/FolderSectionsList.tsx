import type { ReactNode } from "react";
import { FolderOpenIcon } from "../icons";
import type { FolderSection } from "./folderSections";

/* Renders search results exactly like the workspace explorer: folder rows with their marker,
   guide lines along each branch, and compact item rows. `renderItem` receives the flat row
   index in display order so surfaces can drive keyboard navigation. */

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
  const renderNode = (node: FolderSection<T>): ReactNode => (
    <li className="workspace-explorer-folder" key={node.key}>
      <div className="workspace-explorer-folder-row">
        {node.folder ? (
          <span className="workspace-explorer-folder-marker" aria-hidden="true">
            <FolderOpenIcon />
          </span>
        ) : null}
        {onFolderSelect && node.folder ? (
          <button
            type="button"
            className="workspace-explorer-folder-name"
            data-testid={`search-folder-${node.path}`}
            onClick={() => onFolderSelect(node.path)}
          >
            {node.label}
          </button>
        ) : (
          <span className="workspace-explorer-folder-name">{node.label}</span>
        )}
      </div>
      <ul className="workspace-explorer-branch">
        {node.items.map((item) => {
          index += 1;
          return (
            <li className="workspace-explorer-item" key={itemKey(item)}>
              {renderItem(item, index)}
            </li>
          );
        })}
        {node.children.map(renderNode)}
      </ul>
    </li>
  );
  return <ul className="workspace-explorer-tree search-results-tree">{sections.map(renderNode)}</ul>;
}
