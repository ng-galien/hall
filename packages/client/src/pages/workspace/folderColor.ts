import type { CSSProperties } from "react";

/**
 * Icon props that paint a folder icon with its shared colour; no colour keeps the grey icon.
 * @implements-requirement HALL-FR-WSP-480
 */
export function folderColorIconProps(color: string | null | undefined): {
  className?: string;
  style?: CSSProperties;
  "data-folder-color"?: string;
} {
  if (!color) return {};
  return {
    className: "app-icon workspace-folder-icon-colored",
    style: { "--workspace-folder-color": color } as CSSProperties,
    "data-folder-color": color,
  };
}
