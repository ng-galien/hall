import "@fontsource/public-sans/300.css";
import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/600.css";
import "./index.css";

/** Met chaque aperçu, rendu en 1280×800, à l'échelle de son cadre. */
for (const frame of document.querySelectorAll<HTMLElement>(".proposal-frame")) {
  new ResizeObserver(() => frame.style.setProperty("--preview-scale", String(frame.clientWidth / 1280))).observe(frame);
}
