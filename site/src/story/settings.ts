/**
 * Settings of a scroll-driven story: the share and playback duration of each sub-step, the named moments of the
 * choreography and the camera keys. All instants are fractions of a sub-step, so that a sub-step can be lengthened,
 * shortened or cut without moving the other sub-steps' moments.
 */

/** Edge of a moment: a fraction of its sub-step, or the same instant as another moment's edge ("name.start"). */
export type Edge = number | `${string}.${"start" | "end"}`;

export interface StepSettings {
  /** Share of the story given to the sub-step in the scroll and in its playback duration. */
  weight: number;
  /** Playback speed factor of the sub-step: 1 by default, 1.5 = half again as long. */
  pace?: number;
  /** Instant reached by a jump to the sub-step (menu, gutter), as a fraction; `playback.landing` by default. */
  landing?: number;
  /** Instant where the playback of the sub-step stops, as a fraction; `playback.rest` by default. */
  rest?: number;
}

export interface MomentSettings {
  /** Plain description shown in the studio. */
  label: string;
  /** Row of the studio timeline; one of `actors`. */
  actor: string;
  /** Sub-step in which `start` is counted. */
  step: string;
  start: Edge;
  /** End of the moment; a moment without end is an instant. */
  end?: Edge;
  /** Sub-step in which a numeric `end` is counted, when it differs from `step`. */
  endStep?: string;
  /** Parent moment: numeric edges are then fractions of the parent's duration (below 0 or above 1 allowed). */
  within?: string;
  /** Moment that must have ended before this one starts; when it moves, this one moves with it. */
  after?: string;
  /** Named proportions of the moment's own duration (staggered groups, sub-phases). */
  params?: Record<string, number>;
}

export interface CameraKey {
  /** Absolute progress, for the keys before and after the story. */
  p?: number;
  step?: string;
  at?: number;
  /** Named target of the camera. */
  aim: string;
  /** Azimuth and elevation in degrees, distance in metres. */
  az: number;
  el: number;
  dist: number;
}

export interface PlaybackSettings {
  /** Base duration of a sub-step: baseMs + msPerWeight × weight, then × pace. */
  baseMs: number;
  msPerWeight: number;
  /** Multiplier of the base duration for an explicit command: card arrows, keyboard, opening arrow. */
  controlRatio: number;
  /** Multiplier of the base duration for a gesture of a notched mouse wheel, which plays one sub-step. */
  wheelRatio: number;
  /** Speed of continuous scrolling (touchpad, TrackPoint, wheel without notches) in the story, relative to the
      native scrolling: on Mac and on the other systems. 1 leaves the native scrolling untouched. */
  continuousScrollFactor: { mac: number; other: number };
  landing: number;
  rest: number;
  /** Camera flight of a jump to a distant sub-step. */
  jumpMs: number;
  /** The fiche keeps the previous sub-step's state during this part of the jump. */
  boardSwapMs: number;
  /** Beyond this distance in progress, a playback becomes a jump. */
  jumpBeyond: number;
  /** Glide of the page between the story and the section below. */
  glideMs: number;
}

export interface StorySettings {
  /** Bounds of the story in the scroll: opening before, invitation after. */
  storyStart: number;
  storyEnd: number;
  playback: PlaybackSettings;
  /** Rows of the studio timeline: identifier → French label. */
  actors: Record<string, string>;
  steps: Record<string, StepSettings>;
  moments: Record<string, MomentSettings>;
  camera: CameraKey[];
  /** Small offsets in progress units (visibility thresholds, flash duration). */
  margins: Record<string, number>;
  /** Proportions of animation shapes shared by several moments. */
  shapes: Record<string, number>;
}

/** Deep copy, so that an edited version never shares objects with the loaded one. */
export function cloneSettings(settings: StorySettings): StorySettings {
  return structuredClone(settings);
}

/** Short fingerprint of settings (FNV-1a of their JSON), to tell whether two copies are the same version. */
export function settingsFingerprint(settings: StorySettings): string {
  const text = JSON.stringify(settings);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
