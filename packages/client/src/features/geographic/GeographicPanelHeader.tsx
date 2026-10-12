import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { DragHandleIcon } from "../../components/icons";

/**
 * Shared header of the map's side window (Éléments, Mesures): the tabs of the panel on one compact band, which is also
 * the handle that moves the window.
 */
export function GeographicPanelHeader({
  children,
  testId,
  drag,
}: {
  children: ReactNode;
  testId: string;
  drag: {
    onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void;
    onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void;
    onPointerUp(event: ReactPointerEvent<HTMLDivElement>): void;
  };
}) {
  return (
    <div
      className="geographic-panel-header"
      data-testid={testId}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerUp}
    >
      <DragHandleIcon aria-hidden="true" />
      {children}
    </div>
  );
}
