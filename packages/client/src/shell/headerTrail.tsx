import { createContext, type ReactNode, useContext, useEffect } from "react";
import { createPortal } from "react-dom";

export const HeaderTrailSlotContext = createContext<HTMLElement | null>(null);

/** Renders a page's own trail in the first line of the screen header, on tablet and computer. */
export function HeaderTrail({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderTrailSlotContext);
  return slot ? createPortal(children, slot) : null;
}

export const ScreenActionsSlotContext = createContext<HTMLElement | null>(null);

/** Renders the action of the screen at the right of the screen header, before the user's initials. */
export function ScreenActions({ children }: { children: ReactNode }) {
  const slot = useContext(ScreenActionsSlotContext);
  return slot ? createPortal(children, slot) : null;
}

export const ScreenTitleContext = createContext<(title: string | null) => void>(() => undefined);

/** Names the screen in the large title of the screen header when the route alone cannot name it. */
export function ScreenTitle({ children }: { children: string }) {
  const setTitle = useContext(ScreenTitleContext);
  useEffect(() => {
    setTitle(children);
    return () => setTitle(null);
  }, [children, setTitle]);
  return null;
}

export const ScreenScrolledContext = createContext(false);

/** True once the content of the screen has scrolled: the header keeps one line and « + Nouveau » becomes « + ». */
export function useScreenScrolled(): boolean {
  return useContext(ScreenScrolledContext);
}

export const ScreenLeadingSlotContext = createContext<HTMLElement | null>(null);

/** Renders at the start of the screen header, on tablet and computer: the control that reopens a folded panel. */
export function ScreenLeading({ children }: { children: ReactNode }) {
  const slot = useContext(ScreenLeadingSlotContext);
  return slot ? createPortal(children, slot) : null;
}
