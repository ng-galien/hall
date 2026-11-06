import type { Edge, MomentSettings, StorySettings } from "./settings";

/**
 * Timeline of a story: sub-step bounds in progress units (0 to 1 over the whole scroll), derived from the weights,
 * and the resolution of named moments into progress intervals. The settings can be replaced at any time; every
 * reading after `set` uses the new values.
 */
export class Timeline {
  settings: StorySettings;
  /** Incremented at each change of settings, for the readers that cache derived values. */
  revision = 0;
  private bounds = new Map<string, [number, number]>();
  private resolved = new Map<string, [number, number]>();
  private resolving = new Set<string>();

  constructor(
    readonly order: string[],
    settings: StorySettings,
  ) {
    this.settings = settings;
    this.compute();
  }

  set(settings: StorySettings) {
    this.settings = settings;
    this.compute();
    this.revision++;
  }

  private compute() {
    const { storyStart, storyEnd, steps } = this.settings;
    const weight = (id: string) => {
      const step = steps[id];
      if (!step) throw new Error(`Sub-step without settings: ${id}`);
      return step.weight;
    };
    const total = this.order.reduce((sum, id) => sum + weight(id), 0);
    this.bounds.clear();
    this.resolved.clear();
    let cursor = storyStart;
    for (const id of this.order) {
      const length = ((storyEnd - storyStart) * weight(id)) / total;
      this.bounds.set(id, [cursor, cursor + length]);
      cursor += length;
    }
  }

  range(id: string): [number, number] {
    const value = this.bounds.get(id);
    if (!value) throw new Error(`Unknown sub-step: ${id}`);
    return value;
  }

  /** Instant at fraction f of the sub-step. */
  at(id: string, f: number): number {
    const [a, b] = this.range(id);
    return a + (b - a) * f;
  }

  between(id: string, from: number, to: number): [number, number] {
    return [this.at(id, from), this.at(id, to)];
  }

  /** Fraction of the sub-step at progress p (outside 0..1 before or after it). */
  fraction(id: string, p: number): number {
    const [a, b] = this.range(id);
    return (p - a) / (b - a);
  }

  /** Index of the sub-step that contains p; -1 before the first. */
  stepAt(p: number): number {
    let index = -1;
    this.order.forEach((id, i) => {
      if (p >= this.range(id)[0]) index = i;
    });
    return index;
  }

  momentSettings(name: string): MomentSettings {
    const moment = this.settings.moments[name];
    if (!moment) throw new Error(`Unknown moment: ${name}`);
    return moment;
  }

  /** Interval of a moment in progress units; an instant gives [t, t]. */
  moment(name: string): [number, number] {
    const known = this.resolved.get(name);
    if (known) return known;
    if (this.resolving.has(name)) throw new Error(`Circular moment reference: ${name}`);
    this.resolving.add(name);
    try {
      const moment = this.momentSettings(name);
      const start = this.edge(moment, moment.start, moment.step);
      const end = moment.end === undefined ? start : this.edge(moment, moment.end, moment.endStep ?? moment.step);
      const value: [number, number] = [start, end];
      this.resolved.set(name, value);
      return value;
    } finally {
      this.resolving.delete(name);
    }
  }

  private edge(moment: MomentSettings, edge: Edge, step: string): number {
    if (typeof edge === "string") {
      const [name, side] = edge.split(".");
      return this.moment(name)[side === "end" ? 1 : 0];
    }
    if (moment.within) {
      const [a, b] = this.moment(moment.within);
      return a + (b - a) * edge;
    }
    return this.at(step, edge);
  }

  start(name: string): number {
    return this.moment(name)[0];
  }

  end(name: string): number {
    return this.moment(name)[1];
  }

  /** Instant at proportion k of a moment. */
  within(name: string, k: number): number {
    const [a, b] = this.moment(name);
    return a + (b - a) * k;
  }

  param(name: string, key: string): number {
    const value = this.momentSettings(name).params?.[key];
    if (value === undefined) throw new Error(`Moment ${name} has no parameter ${key}`);
    return value;
  }

  margin(key: string): number {
    const value = this.settings.margins[key];
    if (value === undefined) throw new Error(`Unknown margin: ${key}`);
    return value;
  }

  shape(key: string): number {
    const value = this.settings.shapes[key];
    if (value === undefined) throw new Error(`Unknown shape: ${key}`);
    return value;
  }

  /** Base playback duration of a sub-step, before the command ratio. */
  stepMs(id: string): number {
    const { baseMs, msPerWeight } = this.settings.playback;
    const step = this.settings.steps[id];
    return (baseMs + msPerWeight * step.weight) * (step.pace ?? 1);
  }

  landing(id: string): number {
    return this.settings.steps[id].landing ?? this.settings.playback.landing;
  }

  rest(id: string): number {
    return this.settings.steps[id].rest ?? this.settings.playback.rest;
  }

  /** Camera keys with their progress. */
  cameraKeys() {
    return this.settings.camera.map((key) => ({
      ...key,
      p: key.p ?? this.at(key.step as string, key.at as number),
    }));
  }
}
