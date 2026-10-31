/** Cadence mesurée de l'écran de lancement : intervalles entre images, en millisecondes. */
export interface FrameStatistics {
  frames: number;
  durationMs: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  dropped: number;
  /** Les plus longs intervalles : instant de l'image depuis le chargement de la page et durée. */
  longest: { atMs: number; ms: number }[];
}

function percentile(sorted: readonly number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(ratio * sorted.length))]!;
}

/** Relève l'instant de chaque image ; une image perdue est un intervalle plus long que la cadence médiane. */
export function createFrameProbe() {
  const intervals: number[] = [];
  const instants: number[] = [];
  let first: number | null = null;
  let last: number | null = null;
  return {
    record(now: number): void {
      if (last !== null) {
        intervals.push(now - last);
        instants.push(now);
      }
      first ??= now;
      last = now;
    },
    statistics(): FrameStatistics {
      const sorted = [...intervals].sort((a, b) => a - b);
      const median = percentile(sorted, 0.5);
      const dropped =
        median > 0
          ? intervals.reduce((total, interval) => total + Math.max(0, Math.round(interval / median) - 1), 0)
          : 0;
      const round = (value: number) => Math.round(value * 10) / 10;
      return {
        frames: intervals.length,
        durationMs: Math.round((last ?? 0) - (first ?? 0)),
        medianMs: round(median),
        p95Ms: round(percentile(sorted, 0.95)),
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
