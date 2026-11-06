/*
 * Arrivée sur une page du site public. Le fond du thème et le masquage initial sont posés dans le <head>
 * de chaque page (classe is-arriving). Le texte apparaît une fois les polices prêtes, la scène 3D en fondu
 * après ses premières images rendues avec la caméra et les matériaux définitifs.
 */
const root = document.documentElement;

/** Vers une autre page du site : la page s'efface avant de partir, la suivante arrive en fondu. */
function leaveSmoothly(): void {
  document.addEventListener("click", (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = (event.target as Element | null)?.closest?.("a[href]");
    if (
      !(link instanceof HTMLAnchorElement) ||
      (link.target && link.target !== "_self") ||
      link.hasAttribute("download")
    )
      return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || url.pathname === location.pathname) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    event.preventDefault();
    root.classList.add("is-leaving");
    setTimeout(() => location.assign(url.href), 180);
  });
  window.addEventListener("pageshow", () => root.classList.remove("is-leaving"));
}

export function revealText(): void {
  leaveSmoothly();
  const fonts = document.fonts
    ? Promise.all(["400", "600", "700", "800"].map((weight) => document.fonts.load(`${weight} 1rem "Public Sans"`)))
    : Promise.resolve();
  const limit = new Promise((resolve) => setTimeout(resolve, 900));
  Promise.race([fonts, limit]).then(() => requestAnimationFrame(() => root.classList.remove("is-arriving")));
}

export function revealScene(): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      root.dataset.scene = "ready";
    }),
  );
}

/** Changement de plan sans trajet : la scène s'efface, le plan change, puis elle revient. */
export function crossfade(hosts: HTMLElement[], change: () => void, ms = 150): void {
  for (const host of hosts) {
    host.style.setProperty("--cut-ms", `${ms}ms`);
    host.classList.add("can-cut", "is-cutting");
  }
  setTimeout(() => {
    change();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        for (const host of hosts) host.classList.remove("is-cutting");
      }),
    );
  }, ms);
}
