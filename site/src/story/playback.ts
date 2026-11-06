import type { TimeBase } from "./timebase";

/**
 * Playback of a story for the studio, on the time base of the card arrows: reading on plays the sub-steps one
 * after the other as successive arrow presses would; replaying a sub-step plays it exactly as one arrow press.
 * `speed` slows the reading down.
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
    let last = performance.now();
    this.seek(this.base().progress(t));
    const step = (now: number) => {
      t = Math.min(to, t + (Math.max(0, now - last) / 1000) * this.speed);
      last = now;
      this.seek(this.base().progress(t));
      if (t >= to) return this.stop();
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
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
