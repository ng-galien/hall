import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export type CompositionLayout = { left: number; top: number };

function storageKey(resourceId: string): string {
  return `hall.workspace.geographic.composition.${resourceId}`;
}

function storedLayout(resourceId: string): CompositionLayout | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(storageKey(resourceId)) ?? "null",
    ) as Partial<CompositionLayout> | null;
    if (value && Number.isFinite(value.left) && Number.isFinite(value.top)) {
      return { left: Math.max(0, Number(value.left)), top: Math.max(0, Number(value.top)) };
    }
  } catch {
    return null;
  }
  return null;
}

function persistLayout(resourceId: string, layout: CompositionLayout): void {
  try {
    localStorage.setItem(storageKey(resourceId), JSON.stringify(layout));
  } catch {
    return;
  }
}

/**
 * Persists and constrains the position of the map's side window, shared by Éléments and Mesures so that switching
 * mode keeps the window where the user put it; its size follows its content or the user's resize.
 */
// @implements-requirement HALL-FR-DOC-490
export function useGeographicCompositionLayout(resourceId: string, panel: string | null) {
  const active = panel !== null;
  const panelRef = useRef<HTMLElement | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const [layout, setLayout] = useState<CompositionLayout | null>(() => storedLayout(resourceId));

  const updateLayout = useCallback(
    (update: (current: CompositionLayout | null) => CompositionLayout) => {
      setLayout((current) => {
        const next = update(current);
        persistLayout(resourceId, next);
        return next;
      });
    },
    [resourceId],
  );

  useEffect(() => setLayout(storedLayout(resourceId)), [resourceId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the observed element changes when the other panel opens.
  useEffect(() => {
    if (!active) return;
    const element = panelRef.current;
    const container = element?.parentElement;
    if (!element || !container) return;
    const captureLayout = () => {
      const panelRect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const width = Math.min(panelRect.width, containerRect.width);
      const height = Math.min(panelRect.height, containerRect.height);
      updateLayout((current) => {
        const left = Math.max(
          0,
          Math.min(current?.left ?? panelRect.left - containerRect.left, containerRect.width - width),
        );
        const top = Math.max(
          0,
          Math.min(current?.top ?? panelRect.top - containerRect.top, containerRect.height - height),
        );
        return current && current.left === left && current.top === top ? current : { left, top };
      });
    };
    captureLayout();
    const observer = new ResizeObserver(captureLayout);
    observer.observe(element);
    observer.observe(container);
    return () => observer.disconnect();
  }, [active, panel, updateLayout]);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    // A press on a control of the header (a tab, a button) uses that control; elsewhere it moves the window.
    if (event.button !== 0 || !panelRef.current) return;
    if ((event.target as Element).closest("button, a, input, [role='tab']")) return;
    const panelRect = panelRef.current.getBoundingClientRect();
    const containerRect = panelRef.current.parentElement?.getBoundingClientRect();
    if (!containerRect) return;
    dragOffsetRef.current = { x: event.clientX - panelRect.left, y: event.clientY - panelRect.top };
    updateLayout(() => ({ left: panelRect.left - containerRect.left, top: panelRect.top - containerRect.top }));
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const offset = dragOffsetRef.current;
    const element = panelRef.current;
    const container = element?.parentElement;
    if (!offset || !element || !container) return;
    const containerRect = container.getBoundingClientRect();
    const panelRect = element.getBoundingClientRect();
    updateLayout(() => ({
      left: Math.max(0, Math.min(event.clientX - containerRect.left - offset.x, containerRect.width - panelRect.width)),
      top: Math.max(0, Math.min(event.clientY - containerRect.top - offset.y, containerRect.height - panelRect.height)),
    }));
  };

  const stopDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragOffsetRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const style: CSSProperties | undefined = layout
    ? ({ left: layout.left, "--geographic-panel-top": `${layout.top}px` } as CSSProperties)
    : undefined;

  return { panelRef, style, startDrag, move, stopDrag };
}
