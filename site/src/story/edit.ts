import { cloneSettings, type MomentSettings, type StorySettings } from "./settings";
import { easeInOut, TimeBase } from "./timebase";
import { Timeline } from "./timeline";

/**
 * Edits of story settings, as pure functions: each returns new settings. Instants are given in seconds of
 * playback (TimeBase), so that what the studio shows is what a visitor gets with the card arrows. They are written
 * back as fractions of the sub-step that contains them; an edge that does not move keeps its written value.
 * Moments that depend on an edited moment follow it: a reference ("name.end") or a parent (`within`) is resolved
 * again at reading time, and a moment declared `after` another, or starting on its edge, moves by the same time.
 */

/** Fractions written with five decimals, playback factors with six: a cut stays exact to the millisecond. */
const round = (value: number) => Math.round(value * 100000) / 100000;
const roundPace = (value: number) => Math.round(value * 1000000) / 1000000;
const timeBase = (order: string[], settings: StorySettings) => new TimeBase(new Timeline(order, settings));

/** Moments that follow `name`: declared after it, positioned within it, or referring to one of its edges. */
export function dependents(settings: StorySettings, name: string): string[] {
  return Object.entries(settings.moments)
    .filter(
      ([, moment]) =>
        moment.after === name ||
        moment.within === name ||
        [moment.start, moment.end].some((edge) => typeof edge === "string" && edge.split(".")[0] === name),
    )
    .map(([key]) => key);
}

/** Writes one numeric edge at progress p: in its sub-step while it stays there, else in the sub-step of p. */
function setEdge(timeline: Timeline, moment: MomentSettings, edge: "start" | "end", p: number) {
  if (typeof moment[edge] !== "number") return;
  if (moment.within) {
    const [a, b] = timeline.moment(moment.within);
    moment[edge] = round((p - a) / (b - a || 1));
    return;
  }
  const own = edge === "start" ? moment.step : (moment.endStep ?? moment.step);
  let step = own;
  let f = timeline.fraction(own, p);
  if (f < -1e-9 || f > 1 + 1e-9) {
    step = timeline.order[Math.max(0, timeline.stepAt(edge === "end" ? p - 1e-9 : p))];
    f = timeline.fraction(step, p);
  }
  if (edge === "start") {
    if (step !== moment.step && typeof moment.end === "number" && moment.endStep === undefined)
      moment.endStep = moment.step;
    moment.step = step;
    moment.start = round(f);
  } else {
    moment.end = round(f);
    moment.endStep = step;
  }
  if (moment.endStep === moment.step) delete moment.endStep;
}

/** Places a moment at [start, end] in progress; edges that do not move are left as written. */
function placeMoment(timeline: Timeline, moment: MomentSettings, start: number, end: number) {
  const current = currentInterval(timeline, moment);
  if (Math.abs(current[0] - start) > 1e-12) setEdge(timeline, moment, "start", start);
  if (moment.end !== undefined && Math.abs(current[1] - end) > 1e-12) setEdge(timeline, moment, "end", end);
}

/** Interval of a moment object that may not be registered under its name in `timeline`. */
function currentInterval(timeline: Timeline, moment: MomentSettings): [number, number] {
  const edge = (value: MomentSettings["start"], step: string): number => {
    if (typeof value === "string") {
      const [name, side] = value.split(".");
      return timeline.moment(name)[side === "end" ? 1 : 0];
    }
    if (moment.within) {
      const [a, b] = timeline.moment(moment.within);
      return a + (b - a) * value;
    }
    return timeline.at(step, value);
  };
  const start = edge(moment.start, moment.step);
  return [start, moment.end === undefined ? start : edge(moment.end, moment.endStep ?? moment.step)];
}

/**
 * Moves the moments that depend on `name` by the time its edge moved: its end for a moment declared `after` it,
 * the referenced edge for a moment that starts or ends on it. A dependent moment within one sub-step moves as a
 * whole; one that spans several sub-steps keeps its end. Recursive.
 */
function follow(settings: StorySettings, before: TimeBase, name: string, seen: Set<string>) {
  const order = before.timeline.order;
  const after = timeBase(order, settings);
  const was = before.timeline.moment(name);
  const now = after.timeline.moment(name);
  const shift = {
    start: after.time(now[0]) - before.time(was[0]),
    end: after.time(now[1]) - before.time(was[1]),
  };
  for (const [key, moment] of Object.entries(settings.moments)) {
    if (seen.has(key) || moment.within === name) continue;
    const reference = [moment.start, moment.end]
      .filter((edge): edge is `${string}.${"start" | "end"}` => typeof edge === "string")
      .find((edge) => edge.split(".")[0] === name);
    if (moment.after !== name && !reference) continue;
    const delta = moment.after === name ? shift.end : shift[(reference as string).split(".")[1] as "start" | "end"];
    if (Math.abs(delta) < 1e-9) continue;
    seen.add(key);
    const [start, end] = before.timeline.moment(key);
    const snapshot = timeBase(order, cloneSettings(settings));
    const spans = moment.endStep !== undefined && moment.endStep !== moment.step;
    const newStart = before.progress(before.time(start) + delta);
    const newEnd = spans ? Math.max(end, newStart) : before.progress(before.time(end) + delta);
    placeMoment(snapshot.timeline, moment, newStart, newEnd);
    follow(settings, snapshot, key, seen);
  }
}

/** Moves a moment by `delta` seconds; the moments that depend on it follow. It never starts before its `after`. */
export function moveMoment(settings: StorySettings, order: string[], name: string, delta: number): StorySettings {
  const next = cloneSettings(settings);
  const before = timeBase(order, settings);
  const moment = next.moments[name];
  const [start, end] = before.timeline.moment(name);
  let t0 = before.time(start) + delta;
  let t1 = before.time(end) + delta;
  if (moment.after) {
    const floor = before.time(before.timeline.end(moment.after));
    if (t0 < floor) {
      t1 += floor - t0;
      t0 = floor;
    }
  }
  placeMoment(before.timeline, moment, before.progress(t0), before.progress(t1));
  follow(next, before, name, new Set([name]));
  return next;
}

/** Sets one edge of a moment to time t; the start never passes the end, nor the end of its `after`. */
export function setMomentEdge(
  settings: StorySettings,
  order: string[],
  name: string,
  edge: "start" | "end",
  t: number,
): StorySettings {
  const next = cloneSettings(settings);
  const before = timeBase(order, settings);
  const moment = next.moments[name];
  const [start, end] = before.timeline.moment(name);
  let p = before.progress(t);
  if (edge === "start") {
    p = Math.min(p, end);
    if (moment.after) p = Math.max(p, before.timeline.end(moment.after));
    placeMoment(before.timeline, moment, p, moment.end === undefined ? p : end);
  } else placeMoment(before.timeline, moment, start, Math.max(p, start));
  follow(next, before, name, new Set([name]));
  return next;
}

/** Moves a camera key to time t, kept between its neighbours. */
export function moveCameraKey(settings: StorySettings, order: string[], index: number, t: number): StorySettings {
  const next = cloneSettings(settings);
  const base = timeBase(order, settings);
  const keys = base.timeline.cameraKeys();
  const key = next.camera[index];
  if (key.step === undefined) return next;
  const low = keys[index - 1]?.p ?? 0;
  const high = keys[index + 1]?.p ?? 1;
  const p = Math.min(high - 1e-6, Math.max(low + 1e-6, base.progress(t)));
  key.step = base.timeline.order[Math.max(0, base.timeline.stepAt(p))];
  key.at = round(base.timeline.fraction(key.step, p));
  return next;
}

/** Changes the playback duration of a sub-step by `factor`; its share of the scroll and its moments are kept. */
export function stretchStep(settings: StorySettings, id: string, factor: number): StorySettings {
  const next = cloneSettings(settings);
  const step = next.steps[id];
  const pace = (step.pace ?? 1) * factor;
  if (Math.abs(pace - 1) < 1e-4) delete step.pace;
  else step.pace = roundPace(pace);
  return next;
}

/**
 * Remapping of progress for the cut of [t1, t2] seconds in the playback of sub-step i: instants before the cut
 * keep their time, instants after it come t2 − t1 earlier, instants inside it go to t1. Outside the playback of
 * sub-step i nothing moves.
 */
export function cutRemap(
  base: TimeBase,
  i: number,
  t1: number,
  t2: number,
  newDuration: number,
): (p: number) => number {
  const from = base.bounds[i];
  const to = base.bounds[i + 1];
  const start = base.starts[i];
  const cut = t2 - t1;
  return (p: number) => {
    if (p <= from || p >= to) return p;
    const t = base.time(p) - start;
    const local = t <= t1 - start ? t : t >= t2 - start ? t - cut : t1 - start;
    return from + (to - from) * easeInOut(Math.min(1, Math.max(0, local / newDuration)));
  };
}

/**
 * Cuts [t1, t2] seconds out of the playback of sub-step `index`: the playback loses exactly that time, what comes
 * after moves up by as much, and the scroll layout is kept. Instants inside the cut collapse to its start.
 */
export function cutStep(
  settings: StorySettings,
  order: string[],
  index: number,
  t1: number,
  t2: number,
): StorySettings {
  const base = timeBase(order, settings);
  const start = base.starts[index];
  const end = start + base.duration(index);
  const a = Math.max(start, Math.min(t1, t2));
  const b = Math.min(end, Math.max(t1, t2));
  const duration = base.duration(index);
  if (b - a <= 1e-6 || b - a >= duration) return cloneSettings(settings);
  const id = order[index];
  const next = stretchStep(settings, id, (duration - (b - a)) / duration);
  const remap = cutRemap(base, index, a, b, duration - (b - a));
  const timeline = base.timeline;
  const moved = (p: number) => Math.abs(remap(p) - p) > 1e-12;
  /* Moments without parent first, then those positioned within a parent, against the remapped parents */
  const names = Object.keys(next.moments).sort(
    (x, y) => Number(Boolean(next.moments[x].within)) - Number(Boolean(next.moments[y].within)),
  );
  for (const name of names) {
    const moment = next.moments[name];
    const [s, e] = timeline.moment(name);
    const reference = moment.within ? new Timeline(order, next) : timeline;
    if (moved(s)) setEdge(reference, moment, "start", remap(s));
    if (moment.end !== undefined && moved(e)) setEdge(reference, moment, "end", remap(e));
  }
  timeline.cameraKeys().forEach((key, k) => {
    const target = next.camera[k];
    if (target.step === undefined || !moved(key.p)) return;
    const p = remap(key.p);
    target.step = order[Math.max(0, timeline.stepAt(p))];
    target.at = round(timeline.fraction(target.step, p));
  });
  for (const step of order) {
    const landing = timeline.at(step, timeline.landing(step));
    if (next.steps[step].landing !== undefined && moved(landing))
      next.steps[step].landing = round(timeline.fraction(step, remap(landing)));
  }
  return next;
}

/** Sets the landing or rest instant of a sub-step (fraction). */
export function setStepMark(
  settings: StorySettings,
  id: string,
  mark: "landing" | "rest",
  fraction: number,
): StorySettings {
  const next = cloneSettings(settings);
  next.steps[id][mark] = round(Math.min(1, Math.max(0, fraction)));
  return next;
}

export interface Change {
  path: string;
  before: unknown;
  after: unknown;
}

/** Differences between two settings, value by value. */
export function diffSettings(before: unknown, after: unknown, path = ""): Change[] {
  if (typeof before === "object" && before && typeof after === "object" && after) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].flatMap((key) =>
      diffSettings(
        (before as Record<string, unknown>)[key],
        (after as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key,
      ),
    );
  }
  return before === after ? [] : [{ path, before: before ?? null, after: after ?? null }];
}
