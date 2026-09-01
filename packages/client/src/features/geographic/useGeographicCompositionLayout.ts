import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export type CompositionLayout = { left: number; top: number; width: number; height: number };

function storageKey(resourceId: string): string {
  return `hall.workspace.geographic.composition.${resourceId}`;
}

function storedLayout(resourceId: string): CompositionLayout | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(storageKey(resourceId)) ?? "null",
    ) as Partial<CompositionLayout> | null;
    if (
      value &&
      Number.isFinite(value.left) &&
      Number.isFinite(value.top) &&
      Number.isFinite(value.width) &&
      Number.isFinite(value.height) &&
      Number(value.width) > 0 &&
      Number(value.height) > 0
    ) {
      return {
        left: Math.max(0, Number(value.left)),
        top: Math.max(0, Number(value.top)),
        width: Number(value.width),
        height: Number(value.height),
      };
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

/** Persists and constrains the draggable composition panel independently from map editing. */
export function useGeographicCompositionLayout(resourceId: string, active: boolean) {
  const panelRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (!active) return;
    const panel = panelRef.current;
    const container = panel?.parentElement;
    if (!panel || !container) return;
    const captureLayout = () => {
      const panelRect = panel.getBoundingClientRect();
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
        const next = { left, top, width, height };
        return current &&
          current.left === next.left &&
          current.top === next.top &&
          current.width === next.width &&
          current.height === next.height
          ? current
          : next;
      });
    };
    captureLayout();
    const observer = new ResizeObserver(captureLayout);
    observer.observe(panel);
    observer.observe(container);
    return () => observer.disconnect();
  }, [active, updateLayout]);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !panelRef.current) return;
    const panelRect = panelRef.current.getBoundingClientRect();
    const containerRect = panelRef.current.parentElement?.getBoundingClientRect();
    if (!containerRect) return;
    dragOffsetRef.current = { x: event.clientX - panelRect.left, y: event.clientY - panelRect.top };
    updateLayout(() => ({
      left: panelRect.left - containerRect.left,
      top: panelRect.top - containerRect.top,
      width: panelRect.width,
      height: panelRect.height,
    }));
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const offset = dragOffsetRef.current;
    const panel = panelRef.current;
    const container = panel?.parentElement;
    if (!offset || !panel || !container) return;
    const containerRect = container.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    updateLayout((current) => ({
      left: Math.max(0, Math.min(event.clientX - containerRect.left - offset.x, containerRect.width - panelRect.width)),
      top: Math.max(0, Math.min(event.clientY - containerRect.top - offset.y, containerRect.height - panelRect.height)),
      width: current?.width ?? panelRect.width,
      height: current?.height ?? panelRect.height,
    }));
  };

  const stopDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragOffsetRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const style = layout
    ? ({ left: layout.left, top: layout.top, width: layout.width, height: layout.height } satisfies CSSProperties)
    : undefined;

  return { panelRef, style, startDrag, move, stopDrag };
}
