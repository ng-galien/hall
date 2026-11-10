import { largestEmptyRectangle, raster, viewportLeaves } from "../geometry.mjs";

/*
 * Exploratory screen-balance indicators. Each one measures the first screen height (what is visible without
 * scrolling) from the geometry of the visible leaves: text runs by their text box, controls, icons and media.
 * `measure` returns the value; the engine compares it with the `low` and `high` parameters and reports a warning
 * outside that range. These rules never fail the check and never enter the baseline.
 */

const cell = 4;

const contentLeaves = (snapshot) => viewportLeaves(snapshot, { content: true });

const metric = (definition) => ({
  family: "balance",
  kind: "metric",
  exploratory: true,
  ...definition,
  defaults: { formats: "all", severity: "indicator", ...definition.defaults },
});

export const coverage = metric({
  id: "density-coverage",
  title: "Surface occupée",
  explanation: "Part de la surface de l'écran couverte par du texte, des commandes, des icônes ou des images.",
  unit: "%",
  defaults: { params: { low: 15, high: 60 } },
  measure({ snapshot }) {
    const { grid, columns, rows } = raster(
      snapshot,
      viewportLeaves(snapshot).map((leaf) => leaf.rect),
      cell,
    );
    const covered = grid.reduce((sum, row) => sum + row.reduce((count, value) => count + value, 0), 0);
    return Math.round((covered / (columns * rows)) * 100);
  },
});

export const elementCount = metric({
  id: "density-elements",
  title: "Éléments visibles",
  explanation: "Nombre de textes, commandes, icônes et images visibles sans défiler.",
  unit: "",
  defaults: { params: { low: 5, high: 80 } },
  measure: ({ snapshot }) => viewportLeaves(snapshot).length,
});

export const textBlocks = metric({
  id: "density-text-blocks",
  title: "Blocs de texte visibles",
  explanation: "Nombre de blocs de texte distincts visibles sans défiler.",
  unit: "",
  defaults: { params: { low: 3, high: 60 } },
  measure: ({ snapshot }) => viewportLeaves(snapshot).filter((leaf) => leaf.kind === "text").length,
});

export const largestGap = metric({
  id: "void-largest-gap",
  title: "Plus grand vide",
  explanation: "Surface du plus grand rectangle sans aucun contenu, en part de l'écran.",
  unit: "%",
  defaults: { params: { low: 0, high: 35 } },
  measure({ snapshot, annotate }) {
    const grid = raster(
      snapshot,
      viewportLeaves(snapshot).map((leaf) => leaf.rect),
      cell,
    );
    const best = largestEmptyRectangle(grid);
    annotate({ x: best.x * cell, y: best.y * cell, w: best.w * cell, h: best.h * cell });
    return Math.round((best.area / (grid.columns * grid.rows)) * 100);
  },
});

export const bottomVoid = metric({
  id: "void-bottom",
  title: "Vide sous le contenu",
  explanation:
    "Part de la hauteur de l'écran laissée vide sous le dernier élément de contenu (hors barres de navigation).",
  unit: "%",
  defaults: { params: { low: 0, high: 40 } },
  measure({ snapshot }) {
    const leaves = contentLeaves(snapshot);
    if (!leaves.length) return 100;
    const bottom = Math.max(...leaves.map((leaf) => leaf.rect.y + leaf.rect.h));
    return Math.max(0, Math.round(((snapshot.viewport.height - bottom) / snapshot.viewport.height) * 100));
  },
});

export const sideBias = metric({
  id: "void-side-bias",
  title: "Contenu collé d'un côté",
  explanation:
    "Différence entre la marge vide à droite et la marge vide à gauche du contenu, en part de la largeur ; positive quand le contenu est collé à gauche.",
  unit: "%",
  defaults: { params: { low: -15, high: 15 } },
  measure({ snapshot }) {
    const leaves = contentLeaves(snapshot);
    if (!leaves.length) return 0;
    const left = Math.min(...leaves.map((leaf) => leaf.rect.x));
    const right = snapshot.viewport.width - Math.max(...leaves.map((leaf) => leaf.rect.x + leaf.rect.w));
    return Math.round(((right - left) / snapshot.viewport.width) * 100);
  },
});

const centroid = (snapshot, axis) => {
  const leaves = contentLeaves(snapshot);
  const total = leaves.reduce((sum, leaf) => sum + leaf.rect.w * leaf.rect.h, 0);
  if (!total) return 0;
  const size = axis === "x" ? snapshot.viewport.width : snapshot.viewport.height;
  const position =
    leaves.reduce(
      (sum, leaf) =>
        sum +
        leaf.rect.w * leaf.rect.h * (axis === "x" ? leaf.rect.x + leaf.rect.w / 2 : leaf.rect.y + leaf.rect.h / 2),
      0,
    ) / total;
  return Math.round(((position - size / 2) / size) * 100);
};

export const horizontalBalance = metric({
  id: "balance-horizontal",
  title: "Équilibre gauche-droite",
  explanation:
    "Écart entre le centre de gravité des surfaces de contenu et le milieu de l'écran, en part de la largeur ; négatif quand le poids est à gauche.",
  unit: "%",
  defaults: { params: { low: -15, high: 15 } },
  measure: ({ snapshot }) => centroid(snapshot, "x"),
});

export const verticalBalance = metric({
  id: "balance-vertical",
  title: "Équilibre haut-bas",
  explanation:
    "Écart entre le centre de gravité des surfaces de contenu et le milieu de l'écran, en part de la hauteur ; négatif quand le poids est en haut.",
  unit: "%",
  defaults: { params: { low: -25, high: 15 } },
  measure: ({ snapshot }) => centroid(snapshot, "y"),
});

export const alignmentAxes = metric({
  id: "balance-alignment-axes",
  title: "Axes d'alignement",
  explanation:
    "Nombre de positions horizontales distinctes (à 4 pixels près) où commencent au moins deux éléments de contenu.",
  unit: "",
  defaults: { params: { low: 1, high: 8 } },
  measure({ snapshot }) {
    const counts = new Map();
    for (const leaf of contentLeaves(snapshot)) {
      if (leaf.kind === "media" && leaf.entry.isSvg && leaf.entry.insideInteractive) continue;
      const x = Math.round(leaf.rect.x / 4) * 4;
      counts.set(x, (counts.get(x) ?? 0) + 1);
    }
    return [...counts.values()].filter((count) => count >= 2).length;
  },
});

export const spacingRegularity = metric({
  id: "balance-spacing-values",
  title: "Espacements verticaux différents",
  explanation:
    "Nombre de valeurs distinctes (à 4 pixels près) d'espace vertical entre deux éléments de contenu successifs qui se chevauchent horizontalement, entre 1 et 64 pixels.",
  unit: "",
  defaults: { params: { low: 0, high: 8 } },
  measure({ snapshot }) {
    const leaves = contentLeaves(snapshot)
      .filter((leaf) => !(leaf.entry.isSvg && leaf.entry.insideInteractive))
      .sort((a, b) => a.rect.y - b.rect.y);
    const gaps = new Set();
    leaves.forEach((leaf, position) => {
      const bottom = leaf.rect.y + leaf.rect.h;
      const next = leaves
        .slice(position + 1)
        .find(
          (other) =>
            other.rect.y >= bottom - 0.5 &&
            other.rect.x < leaf.rect.x + leaf.rect.w &&
            other.rect.x + other.rect.w > leaf.rect.x,
        );
      if (!next) return;
      const gap = next.rect.y - bottom;
      if (gap >= 1 && gap <= 64) gaps.add(Math.round(gap / 4) * 4);
    });
    return gaps.size;
  },
});

export const fontSizes = metric({
  id: "load-font-sizes",
  title: "Tailles de texte différentes",
  explanation: "Nombre de tailles de caractères différentes parmi les textes visibles sans défiler.",
  unit: "",
  defaults: { params: { low: 1, high: 5 } },
  measure: ({ snapshot }) =>
    new Set(
      viewportLeaves(snapshot)
        .filter((leaf) => leaf.kind === "text")
        .map((leaf) => leaf.entry.fontSize),
    ).size,
});

export const fontWeights = metric({
  id: "load-font-weights",
  title: "Graisses de texte différentes",
  explanation: "Nombre de graisses de caractères différentes parmi les textes visibles sans défiler.",
  unit: "",
  defaults: { params: { low: 1, high: 3 } },
  measure: ({ snapshot }) =>
    new Set(
      viewportLeaves(snapshot)
        .filter((leaf) => leaf.kind === "text")
        .map((leaf) => leaf.entry.fontWeight),
    ).size,
});

export const visibleActions = metric({
  id: "load-actions",
  title: "Actions visibles",
  explanation: "Nombre de commandes (liens, boutons, champs, onglets) visibles en même temps sans défiler.",
  unit: "",
  defaults: { params: { low: 1, high: 25 } },
  measure: ({ snapshot }) =>
    viewportLeaves(snapshot).filter((leaf) => leaf.entry.interactive && !leaf.entry.insideInteractive).length,
});

/** Parses `rgb(…)`/`rgba(…)`; a transparent background yields null. */
function parseColor(value) {
  const match = /rgba?\(([^)]+)\)/.exec(value ?? "");
  if (!match) return null;
  const [r, g, b, a = 1] = match[1]
    .split(/[ ,/]+/)
    .filter(Boolean)
    .map(Number);
  return a === 0 ? null : { r, g, b };
}

function luminance({ r, g, b }) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

export const activeStateContrast = {
  id: "active-state-contrast",
  family: "balance",
  kind: "element",
  exploratory: true,
  title: "État actif peu visible",
  explanation:
    "Une commande marquée active (page courante, onglet ou option sélectionnés) se distingue de ses voisines inactives par un contraste de fond ou de couleur inférieur au minimum, sans différence de graisse.",
  unit: ":1",
  defaults: { formats: "all", severity: "indicator", params: { minimum: 3, weightDifference: 200 } },
  /** A heavier weight counts only for a command with visible text; an icon-only command does not change with it. */
  evaluate({ snapshot, params }) {
    const findings = [];
    snapshot.elements.forEach((entry, index) => {
      if (!entry.active) return;
      const sibling = snapshot.elements.find(
        (other) => other !== entry && other.parent === entry.parent && other.tag === entry.tag && !other.active,
      );
      if (!sibling) return;
      const white = { r: 255, g: 255, b: 255 };
      const background = contrast(parseColor(entry.background) ?? white, parseColor(sibling.background) ?? white);
      const foreground = contrast(parseColor(entry.color) ?? white, parseColor(sibling.color) ?? white);
      const value = Math.round(Math.max(background, foreground) * 100) / 100;
      const hasVisibleText = snapshot.elements.some((other) => {
        if (!other.text) return false;
        for (let current = other.parent; current >= 0; current = snapshot.elements[current].parent)
          if (snapshot.elements[current] === entry) return true;
        return other === entry;
      });
      const bolder = hasVisibleText && Math.abs(entry.fontWeight - sibling.fontWeight) >= params.weightDifference;
      if (value < params.minimum && !bolder) findings.push({ index, value, threshold: params.minimum });
    });
    return findings;
  },
};

export const repeatedText = {
  id: "repeated-text",
  family: "balance",
  kind: "element",
  exploratory: true,
  title: "Texte répété dans l'écran",
  explanation: "Un même texte d'au moins la longueur minimale apparaît plusieurs fois, mot pour mot, dans l'écran.",
  unit: "fois",
  defaults: { formats: "all", severity: "indicator", params: { minimumLength: 12 } },
  evaluate({ snapshot, params }) {
    const seen = new Map();
    snapshot.elements.forEach((entry, index) => {
      if (!entry.text || entry.text.length < params.minimumLength) return;
      if (!seen.has(entry.text)) seen.set(entry.text, []);
      seen.get(entry.text).push(index);
    });
    return [...seen.values()]
      .filter((indexes) => indexes.length > 1)
      .map((indexes) => ({ index: indexes[1], value: indexes.length, threshold: 1 }));
  },
};

export const balanceRules = [
  coverage,
  elementCount,
  textBlocks,
  largestGap,
  bottomVoid,
  sideBias,
  horizontalBalance,
  verticalBalance,
  alignmentAxes,
  spacingRegularity,
  fontSizes,
  fontWeights,
  visibleActions,
  activeStateContrast,
  repeatedText,
];
