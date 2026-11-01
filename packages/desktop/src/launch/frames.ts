/** Cadence mesurée de l'écran de lancement : intervalles entre images, en millisecondes. */
export interface FrameStatistics {
  frames: number;
  durationMs: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  referenceFrameMs: number;
  overBudget: number;
  maxMs: number;
  dropped: number;
  /** Les plus longs intervalles : instant de l'image depuis le chargement de la page et durée. */
  longest: { atMs: number; ms: number }[];
}

function percentile(sorted: readonly number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(ratio * sorted.length))]!;
}

/** Samples every frame against an explicit budget, including preparation and the final orbit. */
export function createFrameProbe(referenceFrameMs = 1000 / 60) {
  const intervals: number[] = [];
  const instants: number[] = [];
  let first: number | null = null;
  let last: number | null = null;
  let maximum = 0;
  let dropped = 0;
  let overBudget = 0;
  return {
    record(now: number): void {
      if (last !== null) {
        const interval = now - last;
        intervals.push(interval);
        instants.push(now);
        maximum = Math.max(maximum, interval);
        dropped += Math.max(0, Math.round(interval / referenceFrameMs) - 1);
        if (interval > referenceFrameMs * 1.25) overBudget += 1;
      }
      first ??= now;
      last = now;
    },
    runningStatistics() {
      return {
        frames: intervals.length,
        durationMs: Math.round((last ?? 0) - (first ?? 0)),
        maxMs: maximum,
        referenceFrameMs,
        dropped,
        overBudget,
      };
    },
    samples(): { atMs: number; ms: number }[] {
      return intervals.map((ms, index) => ({ atMs: instants[index]!, ms }));
    },
    statistics(): FrameStatistics {
      const sorted = [...intervals].sort((a, b) => a - b);
      const median = percentile(sorted, 0.5);
      const round = (value: number) => Math.round(value * 10) / 10;
      return {
        frames: intervals.length,
        durationMs: Math.round((last ?? 0) - (first ?? 0)),
        medianMs: round(median),
        p95Ms: round(percentile(sorted, 0.95)),
        p99Ms: round(percentile(sorted, 0.99)),
        referenceFrameMs: round(referenceFrameMs),
        overBudget,
        maxMs: round(sorted.at(-1) ?? 0),
        dropped,
        longest: intervals
          .map((interval, index) => ({ atMs: Math.round(instants[index]!), ms: round(interval) }))
          .sort((a, b) => b.ms - a.ms)
          .slice(0, 12),
      };
    },
  };
}
