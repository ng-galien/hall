import type OlMap from "ol/Map";
import type MapBrowserEvent from "ol/MapBrowserEvent";
import { useEffect, useRef } from "react";
import {
  type GeographicPointerGesture,
  type GeographicPointerState,
  type GeographicPointerTarget,
  geographicCursor,
} from "./geographicCursorPolicy";

/**
 * Applies the cursor of the cursor table to the map viewport: on hover from the element under the pointer, during a
 * drag from the element where the drag started, and again on release.
 */
// @implements-requirement HALL-FR-DOC-440
export function useGeographicMapCursor(
  map: OlMap | null,
  state: GeographicPointerState,
  targetAt: (pixel: number[]) => GeographicPointerTarget,
) {
  const stateRef = useRef(state);
  const targetAtRef = useRef(targetAt);
  targetAtRef.current = targetAt;
  const refreshRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!map) return;
    const viewport = map.getViewport();
    let target: GeographicPointerTarget = "none";
    let gesture: GeographicPointerGesture = "hover";
    let lastPixel: number[] | null = null;
    let frame = 0;
    const apply = () => {
      viewport.style.cursor = geographicCursor(stateRef.current, target, gesture);
    };
    const hover = () => {
      frame = 0;
      target = lastPixel ? targetAtRef.current(lastPixel) : "none";
      apply();
    };
    const move = (event: MapBrowserEvent) => {
      lastPixel = event.pixel;
      if (event.dragging) {
        if (gesture === "hover") {
          gesture = target === "modifiedShape" ? "dragShape" : "panMap";
          apply();
        }
        return;
      }
      if (!frame) frame = window.requestAnimationFrame(hover);
    };
    const release = () => {
      if (gesture === "hover") return;
      gesture = "hover";
      hover();
    };
    const leave = () => {
      lastPixel = null;
      if (gesture === "hover") hover();
    };
    refreshRef.current = () => {
      gesture = "hover";
      hover();
    };
    map.on("pointermove", move);
    map.on("pointerdrag", move);
    window.addEventListener("pointerup", release);
    viewport.addEventListener("pointerleave", leave);
    apply();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      map.un("pointermove", move);
      map.un("pointerdrag", move);
      window.removeEventListener("pointerup", release);
      viewport.removeEventListener("pointerleave", leave);
      viewport.style.cursor = "";
      refreshRef.current = () => undefined;
    };
  }, [map]);

  useEffect(() => {
    stateRef.current = state;
    refreshRef.current();
  }, [state]);
}
