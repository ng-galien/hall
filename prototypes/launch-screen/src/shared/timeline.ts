export type LaunchState = "playing" | "final";

export interface LaunchOptions {
  /** Durée de l'animation jusqu'à l'état final, en secondes. */
  duration: number;
  /** Tenue de l'état final avant reprise de la boucle, en secondes. */
  hold: number;
  /** Rendu de la scène au temps `t` (secondes, borné à `duration`). */
  render: (t: number) => void;
  /** Rendu continu pendant la tenue (scènes WebGL dont la lumière reste vivante). */
  renderWhileHolding?: boolean;
}

const fadeOut = 0.6;

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Progression bornée entre `from` et `to` secondes. */
export function phase(t: number, from: number, to: number): number {
  return clamp01((t - from) / (to - from));
}

export function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

export function easeOutCubic(x: number): number {
  return 1 - (1 - x) ** 3;
}

export function easeOutQuint(x: number): number {
  return 1 - (1 - x) ** 5;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function setState(state: LaunchState): void {
  const root = document.documentElement;
  root.dataset.state = state;
  if (state === "final" && !root.dataset.finalAt) root.dataset.finalAt = String(Math.round(performance.now()));
}

/**
 * Joue l'animation en boucle selon l'horloge (et non le nombre d'images), pose `data-state` sur la racine,
 * fait apparaître la marque en fin d'animation et passe directement à l'état final si l'utilisateur
 * a demandé la réduction des animations.
 */
export function runLaunch(options: LaunchOptions): void {
  const root = document.documentElement;
  const brandIn = Math.max(0, options.duration - 0.9);

  const showFinal = () => {
    root.style.setProperty("--brand-opacity", "1");
    root.style.setProperty("--veil-opacity", "0");
    options.render(options.duration);
    setState("final");
  };

  if (prefersReducedMotion()) {
    root.dataset.motion = "reduced";
    showFinal();
    return;
  }

  let start = performance.now();
  let lastState: LaunchState | null = null;

  const frame = (now: number) => {
    let elapsed = (now - start) / 1000;
    if (elapsed > options.duration + options.hold) {
      start = now;
      elapsed = 0;
    }
    if (elapsed < options.duration) {
      root.style.setProperty("--brand-opacity", String(phase(elapsed, brandIn, options.duration)));
      root.style.setProperty("--veil-opacity", String(1 - phase(elapsed, 0, 0.4)));
      options.render(elapsed);
      if (lastState !== "playing") setState("playing");
      lastState = "playing";
    } else {
      if (lastState !== "final" || options.renderWhileHolding) options.render(options.duration);
      if (lastState !== "final") {
        root.style.setProperty("--brand-opacity", "1");
        setState("final");
      }
      lastState = "final";
      root.style.setProperty(
        "--veil-opacity",
        String(phase(elapsed, options.duration + options.hold - fadeOut, options.duration + options.hold)),
      );
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
