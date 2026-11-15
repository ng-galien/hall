import { type RefObject, useEffect, useRef } from "react";

const swipeDistanceRatio = 0.22;
const swipeVelocity = 0.5;
const decisionDistance = 12;
const tapSlop = 10;
const tapDuration = 500;
const tapFreshness = 700;

type TouchGesture = { x: number; y: number; start: number; end: number | null; moved: boolean };

/**
 * A horizontal swipe on the calendar: the period follows the finger, then the next period comes from the right or the
 * previous one from the left. A vertical move stays the scroll of the hours; a move of an appointment stays its own.
 * Returns the gate of a touch: true for a brief and still touch of one finger, or for a click without touch; false
 * once the finger has moved beyond a few pixels, stayed long, or a second finger has come.
 */
export function useCalendarSwipe(
  target: RefObject<HTMLElement | null>,
  enabled: boolean,
  onPrevious: () => void,
  onNext: () => void,
): () => boolean {
  const handlers = useRef({ onPrevious, onNext });
  handlers.current = { onPrevious, onNext };
  const gesture = useRef<TouchGesture | null>(null);
  const active = useRef(enabled);
  active.current = enabled;
  useEffect(() => {
    const element = target.current;
    if (!element || !enabled) return;
    const onTapStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      gesture.current =
        event.touches.length === 1
          ? { x: touch.clientX, y: touch.clientY, start: performance.now(), end: null, moved: false }
          : { x: 0, y: 0, start: performance.now(), end: null, moved: true };
    };
    const onTapMove = (event: TouchEvent | PointerEvent) => {
      const current = gesture.current;
      if (!current || current.end !== null || current.moved) return;
      if ("touches" in event && event.touches.length !== 1) {
        current.moved = true;
        return;
      }
      if (!("touches" in event) && event.pointerType !== "touch") return;
      const point = "touches" in event ? event.touches[0] : event;
      if (Math.hypot(point.clientX - current.x, point.clientY - current.y) > tapSlop) current.moved = true;
    };
    const onTapEnd = (event: TouchEvent | PointerEvent) => {
      const current = gesture.current;
      if (!current || current.end !== null) return;
      if (event.type === "touchcancel" || event.type === "pointercancel") current.moved = true;
      current.end = performance.now();
    };
    element.addEventListener("touchstart", onTapStart, { capture: true, passive: true });
    element.addEventListener("touchmove", onTapMove, { capture: true, passive: true });
    element.addEventListener("pointermove", onTapMove, { capture: true, passive: true });
    element.addEventListener("touchend", onTapEnd, { capture: true });
    element.addEventListener("touchcancel", onTapEnd, { capture: true });
    element.addEventListener("pointercancel", onTapEnd, { capture: true });
    return () => {
      element.removeEventListener("touchstart", onTapStart, { capture: true });
      element.removeEventListener("touchmove", onTapMove, { capture: true });
      element.removeEventListener("pointermove", onTapMove, { capture: true });
      element.removeEventListener("touchend", onTapEnd, { capture: true });
      element.removeEventListener("touchcancel", onTapEnd, { capture: true });
      element.removeEventListener("pointercancel", onTapEnd, { capture: true });
    };
  }, [target, enabled]);
  useEffect(() => {
    const element = target.current;
    if (!element || !enabled) return;
    let start: { x: number; y: number; time: number } | null = null;
    let horizontal: boolean | null = null;
    let offset = 0;
    const moving = () => element.querySelector<HTMLElement>(".fc-view-harness") ?? element;
    const reset = (animate: boolean) => {
      const view = moving();
      view.style.transition = animate ? "transform 180ms ease-out" : "";
      view.style.transform = "";
    };
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || element.querySelector(".fc-event-mirror, .fc-event-dragging")) {
        start = null;
        return;
      }
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY, time: event.timeStamp };
      horizontal = null;
      offset = 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!start) return;
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      if (horizontal === null) {
        if (Math.abs(dx) < decisionDistance && Math.abs(dy) < decisionDistance) return;
        horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
      }
      if (!horizontal) return;
      if (event.cancelable) event.preventDefault();
      offset = dx;
      const view = moving();
      view.style.transition = "none";
      view.style.transform = `translateX(${dx}px)`;
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (!start || !horizontal) {
        start = null;
        return;
      }
      const width = element.getBoundingClientRect().width || 1;
      const velocity = Math.abs(offset) / Math.max(1, event.timeStamp - start.time);
      start = null;
      if (Math.abs(offset) < width * swipeDistanceRatio && velocity < swipeVelocity) {
        reset(true);
        return;
      }
      const forward = offset < 0;
      const view = moving();
      view.style.transition = "transform 140ms ease-in";
      view.style.transform = `translateX(${forward ? -width : width}px)`;
      window.setTimeout(() => {
        if (forward) handlers.current.onNext();
        else handlers.current.onPrevious();
        const next = moving();
        next.style.transition = "none";
        next.style.transform = `translateX(${forward ? width : -width}px)`;
        requestAnimationFrame(() => requestAnimationFrame(() => reset(true)));
      }, 140);
    };
    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("touchend", onTouchEnd);
    element.addEventListener("touchcancel", onTouchEnd);
    return () => {
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [target, enabled]);
  return () => {
    const current = gesture.current;
    if (!active.current || !current) return true;
    const now = performance.now();
    if (current.end !== null && now - current.end > tapFreshness) return true;
    return !current.moved && (current.end ?? now) - current.start <= tapDuration;
  };
}
