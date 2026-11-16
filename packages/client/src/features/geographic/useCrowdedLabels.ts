import { useLayoutEffect, useState } from "react";

/**
 * True while the buttons of `group` do not hold on its width with their labels: they then show their icon only, until
 * the map grows by the missing width. A change of `labels` measures the group again with its labels.
 */
export function useCrowdedLabels(group: HTMLElement | null, labels: string): boolean {
  const [crowded, setCrowded] = useState(false);
  useLayoutEffect(() => {
    setCrowded(false);
    const bound = group?.closest<HTMLElement>(".geographic-map-stage") ?? group?.parentElement;
    if (!group || !bound || !labels) return;
    let neededBoundWidth: number | null = null;
    const measure = () => {
      if (neededBoundWidth === null) {
        const missing = group.scrollWidth - group.clientWidth;
        if (missing <= 0) return;
        neededBoundWidth = bound.clientWidth + missing;
        setCrowded(true);
      } else if (bound.clientWidth >= neededBoundWidth) {
        neededBoundWidth = null;
        setCrowded(false);
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(group);
    observer.observe(bound);
    return () => observer.disconnect();
  }, [group, labels]);
  return crowded;
}
