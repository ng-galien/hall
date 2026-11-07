export interface LabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Keep labels near their projected anchor, using free edges before displacing other labels. */
export function fitLabel(desired: LabelBox, area: LabelBox, occupied: LabelBox[]): LabelBox {
  const gap = 7;
  const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, Math.max(low, high)));
  const maxX = area.x + area.width - desired.width;
  const maxY = area.y + area.height - desired.height;
  const xs = [desired.x, area.x, maxX];
  const ys = [desired.y, area.y, maxY];
  for (const box of occupied) {
    xs.push(box.x - desired.width - gap, box.x + box.width + gap);
    ys.push(box.y - desired.height - gap, box.y + box.height + gap);
  }
  let best = { ...desired, x: clamp(desired.x, area.x, maxX), y: clamp(desired.y, area.y, maxY) };
  let bestScore = Infinity;
  for (const rawX of xs) {
    for (const rawY of ys) {
      const x = clamp(rawX, area.x, maxX);
      const y = clamp(rawY, area.y, maxY);
      const overlap = occupied.reduce(
        (sum, box) =>
          sum +
          Math.max(0, Math.min(x + desired.width + gap, box.x + box.width) - Math.max(x - gap, box.x)) *
            Math.max(0, Math.min(y + desired.height + gap, box.y + box.height) - Math.max(y - gap, box.y)),
        0,
      );
      const score = overlap * 10000 + Math.hypot((x - desired.x) * 1.35, y - desired.y);
      if (score < bestScore) {
        bestScore = score;
        best = { ...desired, x, y };
      }
    }
  }
  return best;
}
