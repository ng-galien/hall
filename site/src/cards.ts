/** Navigation de carte en carte : une colonne de repères à droite, des flèches dans chaque carte, le clavier. */

interface Card {
  label: string;
  element: HTMLElement | null;
}

/** Flèche fine, dans l'esprit des repères du relief : une tige et une tête ouverte, posées sur un point d'origine. */
function svgChevron(direction: "up" | "down"): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("class", `card-arrow-icon is-${direction}`);
  svg.setAttribute("aria-hidden", "true");
  const flip = direction === "down" ? "matrix(1 0 0 -1 0 20)" : "";
  const group = document.createElementNS(ns, "g");
  if (flip) group.setAttribute("transform", flip);
  const motion = document.createElementNS(ns, "g");
  motion.setAttribute("class", "card-arrow-motion");
  const stem = document.createElementNS(ns, "path");
  stem.setAttribute("class", "card-arrow-stem");
  stem.setAttribute("d", "M10 14.5V5.5");
  const head = document.createElementNS(ns, "path");
  head.setAttribute("class", "card-arrow-head");
  head.setAttribute("d", "M6.25 9.25 10 5.5l3.75 3.75");
  motion.append(stem, head);
  const origin = document.createElementNS(ns, "circle");
  origin.setAttribute("class", "card-arrow-origin");
  origin.setAttribute("cx", "10");
  origin.setAttribute("cy", "16");
  origin.setAttribute("r", "1.1");
  group.append(motion, origin);
  svg.append(group);
  return svg;
}

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function renderCardNavigation(masthead: HTMLElement) {
  const cards: Card[] = [
    { label: "Découvrir", element: null },
    { label: "Télécharger", element: document.querySelector<HTMLElement>("#telecharger .section-inner") },
    { label: "Marche à suivre", element: document.querySelector<HTMLElement>("#telecharger .section-card-install") },
    { label: "Documentation", element: document.querySelector<HTMLElement>("#documentation .section-inner") },
  ].filter((card) => card.label === "Découvrir" || card.element);

  function arrival(): number {
    return masthead.offsetHeight + (window.innerWidth <= 760 ? 12 : 24);
  }

  function topOf(index: number): number {
    const element = cards[index].element;
    if (!element) return 0;
    return Math.max(0, Math.round(element.getBoundingClientRect().top + window.scrollY - arrival()));
  }

  function currentIndex(): number {
    let found = 0;
    cards.forEach((card, index) => {
      if (card.element && card.element.getBoundingClientRect().top < window.innerHeight * 0.45) found = index;
    });
    return found;
  }

  function go(index: number, focus = false) {
    const target = Math.max(0, Math.min(cards.length - 1, index));
    window.scrollTo({ top: topOf(target), behavior: reducedMotion() ? "instant" : "smooth" });
    if (focus) {
      const heading = cards[target].element?.querySelector<HTMLElement>("h2, h3");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
  }

  const rail = document.createElement("nav");
  rail.className = "card-rail";
  rail.dataset.testid = "card-rail";
  rail.setAttribute("aria-label", "Cartes de la page");
  const list = document.createElement("ol");
  const dots: HTMLButtonElement[] = [];
  cards.forEach((card, index) => {
    const item = document.createElement("li");
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "card-dot";
    dot.dataset.testid = `card-dot-${index}`;
    const label = document.createElement("span");
    label.className = "card-dot-label";
    label.textContent = card.label;
    dot.append(label);
    dot.addEventListener("click", () => go(index, true));
    dot.addEventListener("keydown", (event) => {
      const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      const next = Math.max(0, Math.min(cards.length - 1, index + step));
      go(next);
      dots[next].focus({ preventScroll: true });
    });
    item.append(dot);
    list.append(item);
    dots.push(dot);
  });
  rail.append(list);
  document.body.append(rail);

  cards.forEach((card, index) => {
    if (!card.element) return;
    card.element.classList.add("is-card");
    const previous = cards[index - 1];
    const next = cards[index + 1];

    const top = document.createElement("div");
    top.className = "card-arrows";
    for (const [target, direction, text, testId] of [
      [index - 1, "up", previous ? `Carte précédente : ${previous.label}` : "", "card-up"],
      [index + 1, "down", next ? `Carte suivante : ${next.label}` : "", "card-down"],
    ] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "card-arrow";
      button.dataset.testid = `${testId}-${index}`;
      button.disabled = !text;
      if (text) {
        button.setAttribute("aria-label", text);
        button.title = text;
      } else
        button.setAttribute("aria-label", direction === "up" ? "Pas de carte précédente" : "Pas de carte suivante");
      button.append(svgChevron(direction));
      button.addEventListener("click", () => go(target, true));
      top.append(button);
    }
    card.element.prepend(top);

    const bottom = document.createElement("nav");
    bottom.className = "step-nav card-nav";
    bottom.setAttribute("aria-label", "Cartes voisines");
    for (const [target, text, testId] of [
      [index - 1, previous ? `Précédent : ${previous.label}` : "", "card-previous"],
      [index + 1, next ? `Suivant : ${next.label}` : "", "card-next"],
    ] as const) {
      if (!text) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `step-button${testId === "card-next" ? " is-next" : ""}`;
      button.dataset.testid = `${testId}-${index}`;
      button.textContent = text.replace(" :", " :");
      button.addEventListener("click", () => go(target, true));
      bottom.append(button);
    }
    card.element.append(bottom);
  });

  let queued = false;
  function mark() {
    queued = false;
    const active = currentIndex();
    dots.forEach((dot, index) => {
      if (index === active) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
  }
  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(mark);
  }
  window.addEventListener("scroll", queue, { passive: true });
  /* La page change de hauteur quand la scène s'affiche : le repère courant est recalculé. */
  new ResizeObserver(queue).observe(document.body);
  mark();
}
