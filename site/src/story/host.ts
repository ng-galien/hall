import type { StorySettings } from "./settings";

/** What a story page exposes to the studio that frames it (window.__story), in development and studio builds. */
export interface StoryHost {
  steps: { id: string; title: string; place: number }[];
  places: string[];
  /** Settings in use, as a plain copy. */
  settings(): StorySettings;
  /** Replaces the settings in use; the page shows the same instant with the new choreography. */
  apply(settings: StorySettings): void;
  /** Shows the instant p without transition. */
  seek(p: number): void;
  /** Instant shown by the page. */
  shown(): number;
  /** True once the 3D scene is ready. */
  ready(): boolean;
}

declare global {
  interface Window {
    __story?: StoryHost;
  }
}
