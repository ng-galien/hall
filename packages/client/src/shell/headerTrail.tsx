import { createContext, type ReactNode, useContext } from "react";
import { createPortal } from "react-dom";

export const HeaderTrailSlotContext = createContext<HTMLElement | null>(null);

/** Renders a page's own trail in the application header, the single breadcrumb location. */
export function HeaderTrail({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderTrailSlotContext);
  return slot ? createPortal(children, slot) : null;
}

export const PhoneHeaderActionsSlotContext = createContext<HTMLElement | null>(null);

/** Renders the actions of the opened item at the top right of the phone header. */
export function PhoneHeaderActions({ children }: { children: ReactNode }) {
  const slot = useContext(PhoneHeaderActionsSlotContext);
  return slot ? createPortal(children, slot) : null;
}

export const PhoneHeaderTitleSlotContext = createContext<HTMLElement | null>(null);

/** Renders the title of a page the route alone cannot name in the phone header. */
export function PhoneHeaderTitle({ children }: { children: ReactNode }) {
  const slot = useContext(PhoneHeaderTitleSlotContext);
  return slot ? createPortal(children, slot) : null;
}
