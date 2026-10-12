import { type CSSProperties, type RefObject, useEffect, useState } from "react";

type PanelSize = { width?: number; height?: number };

/**
 * Resizable windows of the map. Éléments and Mesures are one side window ("panel"): a size set in one is kept when
 * the other opens. The card of a drawing ("card") keeps its own size.
 */
export type GeographicResizableWindow = "panel" | "card";

const storageKey = (window: GeographicResizableWindow) => `hall.workspace.geographic.${window}-size`;

function sessionSize(window: GeographicResizableWindow): PanelSize | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey(window)) ?? "null") as PanelSize | null;
    const width = Number(value?.width) > 0 ? Number(value?.width) : undefined;
    const height = Number(value?.height) > 0 ? Number(value?.height) : undefined;
    return width || height ? { width, height } : null;
  } catch {
    return null;
  }
}

function persistSize(window: GeographicResizableWindow, size: PanelSize): PanelSize {
  try {
    sessionStorage.setItem(storageKey(window), JSON.stringify(size));
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
export function useGeographicPanelSize(
  panelRef: RefObject<HTMLElement | null>,
  window: GeographicResizableWindow = "panel",
) {
  const [size, setSize] = useState<PanelSize | null>(() => sessionSize(window));

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
          : persistSize(window, { width, height }),
      );
    };
    const observer = new ResizeObserver(keepManualSize);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [panelRef, window]);

  return size ? ({ width: size.width, height: size.height } satisfies CSSProperties) : undefined;
}
