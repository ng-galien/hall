import { type CSSProperties, type RefObject, useEffect, useState } from "react";

/** Map panels whose size the user may change with their resize handle. */
export type GeographicPanelKind = "composition" | "measures";

type PanelSize = { width?: number; height?: number };

function storageKey(kind: GeographicPanelKind): string {
  return `hall.workspace.geographic.panel-size.${kind}`;
}

function sessionSize(kind: GeographicPanelKind): PanelSize | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey(kind)) ?? "null") as PanelSize | null;
    const width = Number(value?.width) > 0 ? Number(value?.width) : undefined;
    const height = Number(value?.height) > 0 ? Number(value?.height) : undefined;
    return width || height ? { width, height } : null;
  } catch {
    return null;
  }
}

function persistSize(kind: GeographicPanelKind, size: PanelSize): PanelSize {
  try {
    sessionStorage.setItem(storageKey(kind), JSON.stringify(size));
  } catch {
    return size;
  }
  return size;
}

/**
 * Without a manual resize the panel takes the height of its content between its CSS bounds.
 * A size set with the resize handle is written by the browser on the element and kept for the browser session.
 */
// @implements-requirement HALL-FR-DOC-490
export function useGeographicPanelSize(kind: GeographicPanelKind, panelRef: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<PanelSize | null>(() => sessionSize(kind));

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const keepManualSize = () => {
      const width = Number.parseFloat(panel.style.width) || undefined;
      const height = Number.parseFloat(panel.style.height) || undefined;
      if (!width && !height) return;
      setSize((current) =>
        current && current.width === width && current.height === height
          ? current
          : persistSize(kind, { width, height }),
      );
    };
    const observer = new ResizeObserver(keepManualSize);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [kind, panelRef]);

  return size ? ({ width: size.width, height: size.height } satisfies CSSProperties) : undefined;
}
