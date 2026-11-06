import type { Timeline } from "./timeline";

const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Playback of a story for the studio: continuous reading at the speed of each sub-step, or the replay of one
 * sub-step exactly as the card arrow plays it. `seek` shows an instant; `speed` slows the reading down.
 */
export class Player {
  speed = 1;
  private frame = 0;
  private onStop: (() => void) | null = null;

  constructor(
    private readonly timeline: Timeline,
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

  /** Real duration of a sub-step played by an explicit command, in milliseconds. */
  stepDuration(id: string): number {
    return this.timeline.settings.playback.controlRatio * this.timeline.stepMs(id);
  }

  /** Reads on from p to the end of the story; each sub-step lasts its real duration divided by the speed. */
  play(from: number, onStop?: () => void) {
    this.stop();
    this.onStop = onStop ?? null;
    let p = from;
    let last = performance.now();
    const end = this.timeline.settings.storyEnd;
    const step = (now: number) => {
      const dt = Math.min(100, now - last) * this.speed;
      last = now;
      const index = Math.max(0, this.timeline.stepAt(p));
      const id = this.timeline.order[index];
      const [a, b] = this.timeline.range(id);
      p = Math.min(end, p + ((b - a) * dt) / this.stepDuration(id));
      this.seek(p);
      if (p >= end) return this.stop();
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  /** Replays a sub-step from the rest of the previous one, eased, as the card arrow does. */
  replay(index: number, onStop?: () => void) {
    this.stop();
    this.onStop = onStop ?? null;
    const order = this.timeline.order;
    const id = order[index];
    const from = index > 0 ? this.timeline.at(order[index - 1], this.timeline.rest(order[index - 1])) : 0;
    const to = this.timeline.at(id, this.timeline.rest(id));
    const ms = this.stepDuration(id) / this.speed;
    const start = performance.now();
    this.seek(from);
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      this.seek(from + (to - from) * easeInOut(k));
      if (k >= 1) return this.stop();
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }
}
