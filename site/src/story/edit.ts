import { cloneSettings, type MomentSettings, type StorySettings } from "./settings";
import { Timeline } from "./timeline";

/**
 * Edits of story settings, as pure functions: each returns new settings. Instants are given in progress units;
 * they are written back as fractions of the sub-step that contains them. Moments that depend on an edited moment
 * follow it: a reference ("name.end") or a parent (`within`) is resolved again at reading time, and a moment
 * declared `after` another is shifted by the same amount as that moment's end.
 */

const round = (value: number) => Math.round(value * 10000) / 10000;

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

/** Sub-step index for an instant, kept within the story. */
function homeStep(timeline: Timeline, p: number): string {
  const index = Math.max(0, timeline.stepAt(p));
  return timeline.order[index];
}

/** Writes the numeric edges of a moment so that they fall at the given instants. Referenced edges are kept. */
function place(timeline: Timeline, moment: MomentSettings, start: number, end: number) {
  if (moment.within) {
    const [a, b] = timeline.moment(moment.within);
    const length = b - a || 1;
    if (typeof moment.start === "number") moment.start = round((start - a) / length);
    if (typeof moment.end === "number") moment.end = round((end - a) / length);
    return;
  }
  if (typeof moment.start === "number") {
    moment.step = homeStep(timeline, start);
    moment.start = round(timeline.fraction(moment.step, start));
  }
  if (typeof moment.end === "number") {
    const endStep = homeStep(timeline, end - 1e-9);
    moment.end = round(timeline.fraction(endStep, end));
    if (endStep === moment.step) delete moment.endStep;
    else moment.endStep = endStep;
  }
}

/**
 * Moves the moments that depend on `name` by the move of the edge they depend on: its end for a moment declared
 * `after` it, the referenced edge for a moment that starts or ends on it. A dependent moment within one sub-step
 * moves as a whole; one that spans several sub-steps keeps its end. Recursive.
 */
function follow(settings: StorySettings, before: Timeline, name: string, seen: Set<string>) {
  const after = new Timeline(before.order, settings);
  const shift = { start: after.start(name) - before.start(name), end: after.end(name) - before.end(name) };
  for (const [key, moment] of Object.entries(settings.moments)) {
    if (seen.has(key) || moment.within === name) continue;
    const reference = [moment.start, moment.end]
      .filter((edge): edge is `${string}.${"start" | "end"}` => typeof edge === "string")
      .find((edge) => edge.split(".")[0] === name);
    const delta = moment.after === name ? shift.end : reference ? shift[reference.split(".")[1] as "start" | "end"] : 0;
    if ((moment.after !== name && !reference) || Math.abs(delta) < 1e-12) continue;
    seen.add(key);
    const [start, end] = before.moment(key);
    const snapshot = new Timeline(before.order, cloneSettings(settings));
    const spans = moment.endStep !== undefined && moment.endStep !== moment.step;
    const newStart = start + delta;
    place(snapshot, moment, newStart, spans ? Math.max(end, newStart) : end + delta);
    follow(settings, snapshot, key, seen);
  }
}

/** Moves a moment by `delta` in progress units; the moments after it follow. */
export function moveMoment(settings: StorySettings, order: string[], name: string, delta: number): StorySettings {
  const next = cloneSettings(settings);
  const before = new Timeline(order, settings);
  const moment = next.moments[name];
  let [start, end] = before.moment(name);
  if (moment.after) {
    const floor = before.end(moment.after);
    if (start + delta < floor) delta = floor - start;
  }
  start += delta;
  end += delta;
  place(before, moment, start, end);
  follow(next, before, name, new Set([name]));
  return next;
}

/** Sets one edge of a moment to the instant p; the start never passes the end, nor the end of its `after`. */
export function setMomentEdge(
  settings: StorySettings,
  order: string[],
  name: string,
  edge: "start" | "end",
  p: number,
): StorySettings {
  const next = cloneSettings(settings);
  const before = new Timeline(order, settings);
  const moment = next.moments[name];
  let [start, end] = before.moment(name);
  if (edge === "start") {
    start = Math.min(p, end);
    if (moment.after) start = Math.max(start, before.end(moment.after));
  } else end = Math.max(p, start);
  if (moment.end === undefined) end = start;
  place(before, moment, start, end);
  follow(next, before, name, new Set([name]));
  return next;
}

/** Moves a camera key to the instant p, kept between its neighbours. */
export function moveCameraKey(settings: StorySettings, order: string[], index: number, p: number): StorySettings {
  const next = cloneSettings(settings);
  const timeline = new Timeline(order, settings);
  const keys = timeline.cameraKeys();
  const key = next.camera[index];
  if (key.step === undefined) return next;
  const low = keys[index - 1]?.p ?? 0;
  const high = keys[index + 1]?.p ?? 1;
  const at = Math.min(high - 1e-6, Math.max(low + 1e-6, p));
  key.step = homeStep(timeline, at);
  key.at = round(timeline.fraction(key.step, at));
  return next;
}

/**
 * Lengthens or shortens a whole sub-step by `factor`: its share of the scroll and its playback duration change in
 * the same proportion; its moments keep their fractions and stretch with it.
 */
export function stretchStep(settings: StorySettings, id: string, factor: number): StorySettings {
  const next = cloneSettings(settings);
  const step = next.steps[id];
  const { baseMs, msPerWeight } = next.playback;
  const duration = (baseMs + msPerWeight * step.weight) * (step.pace ?? 1);
  step.weight = round(step.weight * factor);
  const pace = (duration * factor) / (baseMs + msPerWeight * step.weight);
  if (Math.abs(pace - 1) < 1e-4) delete step.pace;
  else step.pace = round(pace);
  return next;
}

/**
 * Cuts the part [a, b] of a sub-step (fractions): the sub-step loses that length and what follows moves up.
 * Instants inside the cut collapse to its start; the order of all instants is kept, so dependent moments stay after
 * the moments they depend on.
 */
export function cutStep(settings: StorySettings, id: string, a: number, b: number): StorySettings {
  const from = Math.max(0, Math.min(a, b));
  const to = Math.min(1, Math.max(a, b));
  const cut = to - from;
  if (cut <= 0 || cut >= 1) return cloneSettings(settings);
  const remap = (f: number) => round((f <= from ? f : f >= to ? f - cut : from) / (1 - cut));
  const next = stretchStep(settings, id, 1 - cut);
  for (const moment of Object.values(next.moments)) {
    if (moment.within) continue;
    if (moment.step === id && typeof moment.start === "number") moment.start = remap(moment.start);
    if ((moment.endStep ?? moment.step) === id && typeof moment.end === "number") moment.end = remap(moment.end);
  }
  for (const key of next.camera) if (key.step === id && key.at !== undefined) key.at = remap(key.at);
  const step = next.steps[id];
  const original = settings.steps[id];
  if (original.landing !== undefined) step.landing = remap(original.landing);
  if (original.rest !== undefined) step.rest = remap(original.rest);
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
