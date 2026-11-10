import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

const minimumZoom = 1;
const maximumZoom = 5;
const doubleTapZoom = 2.5;
const doubleTapDelay = 300;
const tapMovement = 12;

type Point = { x: number; y: number };

const clampZoom = (zoom: number) => {
  const clamped = Math.min(maximumZoom, Math.max(minimumZoom, zoom));
  return clamped < 1.05 ? minimumZoom : clamped;
};
const distance = (first: Touch, second: Touch) =>
  Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);

// @implements-requirement HALL-FR-DOC-480
/**
 * Pinch and double-tap zoom of a scrolled sheet. During the gesture the sheet is only scaled;
 * its committed zoom then asks the pages to be drawn again at their new size.
 */
export function usePdfTouchZoom(enabled: boolean, scroller: HTMLElement | null, sheet: HTMLElement | null) {
  const [zoom, setZoom] = useState(minimumZoom);
  const committed = useRef(minimumZoom);
  const applyZoom = useCallback(
    (next: number, content: Point, view: Point) => {
      if (!scroller || !sheet) return;
      flushSync(() => setZoom(next));
      committed.current = next;
      sheet.style.transform = "";
      scroller.scrollLeft = content.x * next - view.x;
      scroller.scrollTop = content.y * next - view.y;
    },
    [scroller, sheet],
  );

  useEffect(() => {
    if (!enabled || !scroller || !sheet) return;
    let pinch: { startDistance: number; startZoom: number; content: Point; view: Point; next: number } | null = null;
    let touchStart: (Point & { time: number }) | null = null;
    let lastTap: (Point & { time: number }) | null = null;
    let lastDoubleTap = 0;

    const inScroller = (x: number, y: number): Point => {
      const bounds = scroller.getBoundingClientRect();
      return { x: x - bounds.left, y: y - bounds.top };
    };
    const contentAt = (view: Point): Point => ({
      x: (scroller.scrollLeft + view.x) / committed.current,
      y: (scroller.scrollTop + view.y) / committed.current,
    });
    const toggleAt = (clientX: number, clientY: number) => {
      const view = inScroller(clientX, clientY);
      applyZoom(committed.current > minimumZoom ? minimumZoom : doubleTapZoom, contentAt(view), view);
    };
    const touchCenter = (first: Touch, second: Touch) =>
      inScroller((first.clientX + second.clientX) / 2, (first.clientY + second.clientY) / 2);

    const onTouchStart = (event: TouchEvent) => {
      const [first, second] = [event.touches[0], event.touches[1]];
      if (first && second) {
        const view = touchCenter(first, second);
        touchStart = null;
        lastTap = null;
        pinch = {
          startDistance: distance(first, second),
          startZoom: committed.current,
          content: contentAt(view),
          view,
          next: committed.current,
        };
        sheet.style.transformOrigin = "0 0";
      } else if (first) {
        touchStart = { x: first.clientX, y: first.clientY, time: event.timeStamp };
      }
    };
    const onTouchMove = (event: TouchEvent) => {
      const [first, second] = [event.touches[0], event.touches[1]];
      if (!pinch || !first || !second) return;
      if (event.cancelable) event.preventDefault();
      pinch.next = clampZoom((pinch.startZoom * distance(first, second)) / pinch.startDistance);
      pinch.view = touchCenter(first, second);
      sheet.style.transform = `scale(${pinch.next / pinch.startZoom})`;
      scroller.scrollLeft = pinch.content.x * pinch.next - pinch.view.x;
      scroller.scrollTop = pinch.content.y * pinch.next - pinch.view.y;
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (pinch) {
        if (event.touches.length < 2) {
          applyZoom(pinch.next, pinch.content, pinch.view);
          pinch = null;
        }
        return;
      }
      const touch = event.changedTouches[0];
      const start = touchStart;
      touchStart = null;
      if (!touch || !start) return;
      const stayed = Math.hypot(touch.clientX - start.x, touch.clientY - start.y) < tapMovement;
      if (!stayed || event.timeStamp - start.time > doubleTapDelay) {
        lastTap = null;
        return;
      }
      const tap = { x: touch.clientX, y: touch.clientY, time: event.timeStamp };
      if (
        lastTap &&
        tap.time - lastTap.time < doubleTapDelay &&
        Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 40
      ) {
        lastTap = null;
        lastDoubleTap = tap.time;
        if (event.cancelable) event.preventDefault();
        toggleAt(tap.x, tap.y);
      } else {
        lastTap = tap;
      }
    };
    const onTouchCancel = () => {
      pinch = null;
      touchStart = null;
      sheet.style.transform = "";
    };
    const onDoubleClick = (event: MouseEvent) => {
      if (event.timeStamp - lastDoubleTap > 500) toggleAt(event.clientX, event.clientY);
    };

    scroller.addEventListener("touchstart", onTouchStart, { passive: true });
    scroller.addEventListener("touchmove", onTouchMove, { passive: false });
    scroller.addEventListener("touchend", onTouchEnd, { passive: false });
    scroller.addEventListener("touchcancel", onTouchCancel);
    scroller.addEventListener("dblclick", onDoubleClick);
    return () => {
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchmove", onTouchMove);
      scroller.removeEventListener("touchend", onTouchEnd);
      scroller.removeEventListener("touchcancel", onTouchCancel);
      scroller.removeEventListener("dblclick", onDoubleClick);
    };
  }, [enabled, scroller, sheet, applyZoom]);

  return zoom;
}
