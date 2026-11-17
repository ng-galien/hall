import type { TimeBase } from "./timebase";

/**
 * Shared playback for the page and studio. TimeBase keeps each sub-step's timing when starting in its middle,
 * crossing several steps or reading backwards. `speed` scales this same clock.
 */
export class Player {
  speed = 1;
  private frame = 0;
  private onStop: (() => void) | null = null;

  constructor(
    private readonly base: () => TimeBase,
    private readonly seek: (p: number) => void,
  ) {}

  get playing(): boolean {
    return this.frame !== 0;
  }

  stop() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    const done = this.onStop;
    this.onStop = null;
    done?.();
  }

  /** Plays from time `from` to time `to` (seconds), then calls onStop. */
  private run(from: number, to: number, onStop?: () => void) {
    this.stop();
    this.onStop = onStop ?? null;
    let t = from;
    const direction = Math.sign(to - from);
    let last = performance.now();
    this.seek(this.base().progress(t));
    if (direction === 0) return this.stop();
    const step = (now: number) => {
      const next = t + (Math.max(0, now - last) / 1000) * this.speed * direction;
      t = direction > 0 ? Math.min(to, next) : Math.max(to, next);
      last = now;
      this.seek(this.base().progress(t));
      if (t === to) return this.stop();
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  /** Plays the actual remaining interval, in either direction, without squeezing it into one step. */
  playTo(from: number, to: number, onStop?: () => void) {
    this.run(from, to, onStop);
  }

  /** Reads on from time t to the end of the story. */
  play(t: number, onStop?: () => void) {
    const base = this.base();
    this.run(t, base.starts[base.starts.length - 1], onStop);
  }

  /** Replays sub-step i from the rest instant of the previous one to its own. */
  replay(i: number, onStop?: () => void) {
    const base = this.base();
    this.run(base.starts[i], base.starts[i + 1], onStop);
  }
}
