import { useEffect, useLayoutEffect, useRef } from "react";
import { type Location, useLocation } from "react-router-dom";

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

/** Events by which the person takes the scroll of the screen back from its restoration. */
const interruptions = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
/** The restored position holds once the height of the screen has not changed for this number of frames. */
const restoreStillFrames = 45;
/** The restoration ends after this number of frames, about five seconds. */
const restoreMaxFrames = 300;

// @implements-requirement HALL-FR-LAY-010
/**
 * Records the scroll of each visited screen and starts a new screen at its top. A screen restored to a remembered
 * position has scroll anchoring disabled, and the position is written again until its height stays still or the
 * person scrolls.
 */
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
    const anchor = scroller.style.overflowAnchor;
    scroller.style.overflowAnchor = "none";
    let frames = 0;
    let stillFrames = 0;
    let height = scroller.scrollHeight;
    let request = 0;
    const stop = () => {
      window.cancelAnimationFrame(request);
      scroller.style.overflowAnchor = anchor;
      for (const type of interruptions) scroller.removeEventListener(type, stop);
    };
    const restore = () => {
      if (scroller.scrollTop !== target) scroller.scrollTop = target;
      stillFrames = scroller.scrollHeight === height ? stillFrames + 1 : 0;
      height = scroller.scrollHeight;
      frames += 1;
      if ((stillFrames >= restoreStillFrames && scroller.scrollTop === target) || frames >= restoreMaxFrames) stop();
      else request = window.requestAnimationFrame(restore);
    };
    for (const type of interruptions) scroller.addEventListener(type, stop, { passive: true });
    request = window.requestAnimationFrame(restore);
    return stop;
  }, [active, scroller, location.key, location.pathname, location.search, location.hash]);
}
