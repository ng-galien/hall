export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Progression bornée entre `from` et `to` secondes. */
export function phase(t: number, from: number, to: number): number {
  return clamp01((t - from) / (to - from));
}

export function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

export function easeOutCubic(x: number): number {
  return 1 - (1 - x) ** 3;
}

export function easeOutQuint(x: number): number {
  return 1 - (1 - x) ** 5;
}
