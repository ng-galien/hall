import type { ComponentProps } from "react";

/**
 * An option or tree item of a list driven from its search field through aria-activedescendant: the field keeps the
 * focus and the arrow keys, a click or a tap chooses the row.
 */
// biome-ignore-start lint/a11y/useKeyWithClickEvents: the search field handles the keyboard for every row.
// biome-ignore-start lint/a11y/noStaticElementInteractions: the role of the row is an option or a tree item.
export function ActiveOption({ role, ...props }: ComponentProps<"div"> & { role: "option" | "treeitem" }) {
  return <div role={role} tabIndex={-1} onMouseDown={(event) => event.preventDefault()} {...props} />;
}
// biome-ignore-end lint/a11y/noStaticElementInteractions: the role of the row is an option or a tree item.
// biome-ignore-end lint/a11y/useKeyWithClickEvents: the search field handles the keyboard for every row.
