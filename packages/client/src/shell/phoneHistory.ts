import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { type Location, useLocation, useNavigate } from "react-router-dom";

/** The router numbers its history entries; above zero, the previous entry is a screen of the application. */
export function hasPreviousApplicationScreen(): boolean {
  const state = window.history.state as { idx?: number } | null;
  return (state?.idx ?? 0) > 0;
}

/** Pages read on a phone hand the whole screen to their content. */
export function isPhoneReadingLocation({ pathname, search }: Pick<Location, "pathname" | "search">): boolean {
  const [area, id, section] = pathname.split("/").filter(Boolean);
  if (area === "workspace") return new URLSearchParams(search).has("resource");
  if (area === "meetings") return section === "points";
  return (area === "council-decisions" || area === "minutes") && Boolean(id);
}

// @implements-requirement HALL-FR-LAY-010
/** Records the scroll of each visited screen and starts a new screen at its top. */
export function usePhoneScrollMemory(active: boolean, scroller: HTMLElement | null) {
  const location = useLocation();
  const positions = useRef(new Map<string, number>());
  const current = useRef({ key: location.key, screen: `${location.pathname}${location.search}` });

  useEffect(() => {
    if (!active || !scroller) return;
    const remember = () => positions.current.set(current.current.key, scroller.scrollTop);
    scroller.addEventListener("scroll", remember, { passive: true });
    return () => scroller.removeEventListener("scroll", remember);
  }, [active, scroller]);

  useLayoutEffect(() => {
    const screen = `${location.pathname}${location.search}`;
    const screenChanged = current.current.screen !== screen;
    current.current = { key: location.key, screen };
    if (!active || !scroller || !screenChanged || location.hash) return;
    const target = positions.current.get(location.key) ?? 0;
    scroller.scrollTop = target;
    if (target === 0) return;
    let frames = 0;
    let request = 0;
    const restore = () => {
      scroller.scrollTop = target;
      frames += 1;
      if (scroller.scrollTop !== target && frames < 60) request = window.requestAnimationFrame(restore);
    };
    request = window.requestAnimationFrame(restore);
    return () => window.cancelAnimationFrame(request);
  }, [active, scroller, location.key, location.pathname, location.search, location.hash]);
}

/** A viewer over a phone screen is one step of the history: the back gesture closes it. */
// biome-ignore-start lint/correctness/useExhaustiveDependencies: the history entry is added once, when the viewer opens.
export function usePhoneViewerHistory(active: boolean, onClose: () => void): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const viewerId = useId();
  const pushed = useRef(false);
  const shown = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;
  const state = location.state as { phoneViewer?: string } | null;
  const current = state?.phoneViewer === viewerId;

  useEffect(() => {
    if (!active || pushed.current) return;
    pushed.current = true;
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { state: { ...state, phoneViewer: viewerId } },
    );
  }, [active]);

  useEffect(() => {
    if (!active) return;
    if (current) shown.current = true;
    else if (shown.current) {
      shown.current = false;
      close.current();
    }
  }, [active, current]);

  return active ? () => navigate(-1) : onClose;
}
// biome-ignore-end lint/correctness/useExhaustiveDependencies: the history entry is added once, when the viewer opens.
