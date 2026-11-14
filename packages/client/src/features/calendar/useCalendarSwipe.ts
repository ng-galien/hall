import { type RefObject, useEffect, useRef } from "react";

const swipeDistanceRatio = 0.22;
const swipeVelocity = 0.5;
const decisionDistance = 12;

/**
 * A horizontal swipe on the calendar: the period follows the finger, then the next period comes from the right or the
 * previous one from the left. A vertical move stays the scroll of the hours; a move of an appointment stays its own.
 */
export function useCalendarSwipe(
  target: RefObject<HTMLElement | null>,
  enabled: boolean,
  onPrevious: () => void,
  onNext: () => void,
) {
  const handlers = useRef({ onPrevious, onNext });
  handlers.current = { onPrevious, onNext };
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
}
