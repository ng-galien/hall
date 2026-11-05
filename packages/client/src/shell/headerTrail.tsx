import { createContext, type ReactNode, useContext } from "react";
import { createPortal } from "react-dom";

export const HeaderTrailSlotContext = createContext<HTMLElement | null>(null);

/** Renders a page's own trail in the application header, the single breadcrumb location. */
export function HeaderTrail({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderTrailSlotContext);
  return slot ? createPortal(children, slot) : null;
}
