import type { Timeline } from "./timeline";

/** Easing of the playback of a sub-step, the same as the page's (main.ts, scene.ts). */
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const easeInverse = (u: number) => (u < 0.5 ? Math.cbrt(u / 4) : 1 - Math.cbrt(2 * (1 - u)) / 2);

/**
 * Time base of a story as a visitor plays it with the card arrows: sub-step i plays from the rest instant of
 * sub-step i − 1 (0 for the first) to its own rest instant, eased, in controlRatio × stepMs. Times are seconds from
 * the start of the story; sub-steps follow each other without gap. Past the last rest instant, time continues at
 * the mean speed of the last sub-step.
 */
export class TimeBase {
  /** Progress of the playback bounds: bounds[i] to bounds[i + 1] is the playback of sub-step i. */
  readonly bounds: number[];
  /** Start time of each playback, and the total after the last one. */
  readonly starts: number[];
  readonly durations: number[];

  constructor(readonly timeline: Timeline) {
    const order = timeline.order;
    this.bounds = [0, ...order.map((id) => timeline.at(id, timeline.rest(id)))];
    this.durations = order.map((id) => (timeline.settings.playback.controlRatio * timeline.stepMs(id)) / 1000);
    this.starts = [0];
    for (const duration of this.durations) this.starts.push((this.starts.at(-1) as number) + duration);
  }

  /** Seconds of playback of sub-step i. */
  duration(i: number): number {
    return this.durations[i];
  }

  /** Time at progress p. */
  time(p: number): number {
    const last = this.durations.length - 1;
    if (p >= this.bounds[last + 1]) {
      const slope = this.durations[last] / (this.bounds[last + 1] - this.bounds[last]);
      return this.starts[last + 1] + (p - this.bounds[last + 1]) * slope;
    }
    if (p <= 0) return 0;
    let i = 0;
    while (i < last && p >= this.bounds[i + 1]) i++;
    const u = (p - this.bounds[i]) / (this.bounds[i + 1] - this.bounds[i]);
    return this.starts[i] + this.durations[i] * easeInverse(Math.min(1, Math.max(0, u)));
  }

  /** Progress at time t. */
  progress(t: number): number {
    const last = this.durations.length - 1;
    if (t >= this.starts[last + 1]) {
      const slope = (this.bounds[last + 1] - this.bounds[last]) / this.durations[last];
      return this.bounds[last + 1] + (t - this.starts[last + 1]) * slope;
    }
    if (t <= 0) return 0;
    let i = 0;
    while (i < last && t >= this.starts[i + 1]) i++;
    const k = (t - this.starts[i]) / this.durations[i];
    return this.bounds[i] + (this.bounds[i + 1] - this.bounds[i]) * easeInOut(Math.min(1, Math.max(0, k)));
  }

  /** Index of the playback that contains time t. */
  playbackAt(t: number): number {
    let i = 0;
    while (i < this.durations.length - 1 && t >= this.starts[i + 1]) i++;
    return i;
  }
}
