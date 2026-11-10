import { ancestors, insideHorizontalScroller } from "../geometry.mjs";

/*
 * Sizing rules. Each rule is one declared unit: identifier, French title and explanation for the report, the kind of
 * evaluation, the unit of the measured value and its default setting. A project enables and tunes it in its rules
 * file; `evaluate` receives the snapshot of one screen at one format and the parameters resolved for that format.
 */

const cuttingOverflow = new Set(["hidden", "clip"]);

export const pageHorizontalScroll = {
  id: "page-horizontal-scroll",
  family: "sizing",
  kind: "element",
  title: "Page plus large que l'écran",
  explanation: "La page entière défile horizontalement : une partie du contenu sort de l'écran à droite.",
  unit: "px",
  defaults: { formats: "all", severity: "error", params: { tolerance: 1 } },
  evaluate({ snapshot, params }) {
    const excess = snapshot.document.scrollWidth - snapshot.viewport.width;
    return excess > params.tolerance
      ? [{ index: -1, value: snapshot.document.scrollWidth, threshold: snapshot.viewport.width }]
      : [];
  },
};

export const viewportOverflow = {
  id: "viewport-overflow",
  family: "sizing",
  kind: "element",
  title: "Élément qui dépasse le bord de l'écran",
  explanation:
    "Un élément visible s'étend au-delà du bord gauche ou droit de l'écran sans être dans une zone qui défile horizontalement. Seul l'élément le plus extérieur est signalé.",
  unit: "px",
  defaults: { formats: "all", severity: "error", params: { tolerance: 1 } },
  evaluate({ snapshot, params }) {
    const width = snapshot.viewport.width;
    const overflowing = (entry) =>
      entry.visibleRect.x < -params.tolerance || entry.visibleRect.x + entry.visibleRect.w > width + params.tolerance;
    return snapshot.elements.flatMap((entry, index) => {
      if (!overflowing(entry) || entry.position === "fixed") return [];
      if (insideHorizontalScroller(snapshot, index)) return [];
      if (entry.parent >= 0 && overflowing(snapshot.elements[entry.parent])) return [];
      const right = entry.visibleRect.x + entry.visibleRect.w;
      return [{ index, value: Math.round(right > width ? right : entry.visibleRect.x), threshold: width }];
    });
  },
};

export const clippedContent = {
  id: "clipped-content",
  family: "sizing",
  kind: "element",
  title: "Contenu coupé par son conteneur",
  explanation:
    "Un texte ou une commande dépasse un conteneur qui masque son débordement, sans points de suspension : la partie qui dépasse est invisible. La valeur est la part masquée.",
  unit: "px",
  defaults: { formats: "all", severity: "error", params: { tolerance: 2 } },
  evaluate({ snapshot, params }) {
    return snapshot.elements.flatMap((entry, index) => {
      if (entry.clippedBy < 0 || !(entry.text || entry.interactive)) return [];
      const owner = snapshot.elements[entry.clippedBy];
      if (owner.textOverflow === "ellipsis" || owner.lineClamp) return [];
      const hidden = Math.max(entry.rect.w - entry.visibleRect.w, entry.rect.h - entry.visibleRect.h);
      if (hidden <= params.tolerance) return [];
      const parent = entry.parent >= 0 ? snapshot.elements[entry.parent] : null;
      if (parent && parent.clippedBy === entry.clippedBy && (parent.text || parent.interactive)) return [];
      return [{ index, value: Math.round(hidden), threshold: params.tolerance, detail: `coupé par ${owner.key}` }];
    });
  },
};

export const touchTargetSize = {
  id: "touch-target-size",
  family: "sizing",
  kind: "element",
  title: "Zone d'appui trop petite",
  explanation:
    "Un lien, un bouton, un champ ou une ligne cliquable offre moins que la taille minimale dans une de ses dimensions. Un lien dans une phrase est exempté ; une case à cocher est mesurée avec son libellé.",
  unit: "px",
  defaults: { formats: "touch", severity: "error", params: { minimum: 44 } },
  evaluate({ snapshot, params }) {
    return snapshot.elements.flatMap((entry, index) => {
      if (!entry.interactive || entry.inSentence) return [];
      const size = Math.min(entry.touchRect.w, entry.touchRect.h);
      return size < params.minimum - 0.5
        ? [
            {
              index,
              value: `${Math.round(entry.touchRect.w)} × ${Math.round(entry.touchRect.h)}`,
              threshold: params.minimum,
              sortValue: size,
            },
          ]
        : [];
    });
  },
};

export const textSize = {
  id: "text-size",
  family: "sizing",
  kind: "element",
  title: "Texte trop petit",
  explanation: "Un texte visible est écrit dans une taille de caractères inférieure au minimum du texte courant.",
  unit: "px",
  defaults: { formats: "all", severity: "error", params: { minimum: 14 } },
  evaluate({ snapshot, params }) {
    return snapshot.elements.flatMap((entry, index) =>
      entry.text && entry.fontSize < params.minimum - 0.05
        ? [{ index, value: entry.fontSize, threshold: params.minimum }]
        : [],
    );
  },
};

export const actionIconSize = {
  id: "action-icon-size",
  family: "sizing",
  kind: "element",
  title: "Icône d'action trop petite",
  explanation:
    "Une icône dessinée dans un bouton, un lien ou une ligne cliquable est plus petite que la taille minimale ; sans libellé, elle est le seul repère de l'action.",
  unit: "px",
  defaults: { formats: "all", severity: "error", params: { minimum: 16 } },
  evaluate({ snapshot, params }) {
    return snapshot.elements.flatMap((entry, index) => {
      if (!entry.isSvg || !entry.insideInteractive) return [];
      const size = Math.max(entry.rect.w, entry.rect.h);
      return size > 0 && size < params.minimum - 0.5
        ? [{ index, value: Math.round(size * 10) / 10, threshold: params.minimum }]
        : [];
    });
  },
};

export const truncatedWithoutEllipsis = {
  id: "truncated-without-ellipsis",
  family: "sizing",
  kind: "element",
  title: "Texte tronqué sans points de suspension",
  explanation:
    "Un bloc de texte masque son débordement et son texte est plus long que la place disponible, sans points de suspension pour le signaler. La valeur est la largeur (ou hauteur) masquée.",
  unit: "px",
  defaults: { formats: "all", severity: "error", params: { tolerance: 1 } },
  evaluate({ snapshot, params }) {
    return snapshot.elements.flatMap((entry, index) => {
      const textual = entry.text || (!entry.hasBlockChildren && entry.inlineChildren > 0);
      if (!textual) return [];
      const horizontal =
        cuttingOverflow.has(entry.overflowX) &&
        entry.scrollWidth > entry.clientWidth + params.tolerance &&
        entry.textOverflow !== "ellipsis";
      const vertical =
        cuttingOverflow.has(entry.overflowY) &&
        entry.scrollHeight > entry.clientHeight + params.tolerance + 1 &&
        !entry.lineClamp &&
        entry.text;
      if (!horizontal && !vertical) return [];
      const hidden = horizontal ? entry.scrollWidth - entry.clientWidth : entry.scrollHeight - entry.clientHeight;
      return [{ index, value: hidden, threshold: params.tolerance, detail: horizontal ? "en largeur" : "en hauteur" }];
    });
  },
};

export const nestedScroll = {
  id: "nested-scroll",
  family: "sizing",
  kind: "element",
  title: "Zones de défilement imbriquées",
  explanation:
    "Une zone qui défile se trouve dans une autre zone qui défile dans le même sens (ou dans la page qui défile) : le doigt ou la molette fait défiler l'une ou l'autre selon l'endroit.",
  unit: "",
  defaults: { formats: "all", severity: "error", params: {} },
  evaluate({ snapshot }) {
    return snapshot.elements.flatMap((entry, index) => {
      const axes = [];
      const chain = ancestors(snapshot, index).map((ancestor) => snapshot.elements[ancestor]);
      if (entry.scrollableY && (snapshot.document.scrollsY || chain.some((ancestor) => ancestor.scrollableY)))
        axes.push("vertical");
      if (entry.scrollableX && (snapshot.document.scrollsX || chain.some((ancestor) => ancestor.scrollableX)))
        axes.push("horizontal");
      return axes.length ? [{ index, value: axes.join(" et "), threshold: "une seule zone par sens" }] : [];
    });
  },
};

export const chromeHeight = {
  id: "chrome-height",
  family: "sizing",
  kind: "element",
  title: "Hauteur occupée avant le contenu",
  explanation:
    "Part de la hauteur de l'écran occupée, au-dessus du premier élément de contenu (paragraphe, liste, tableau, grille, image ou ligne pleine largeur), par les en-têtes, titres, barres d'outils et onglets.",
  unit: "%",
  defaults: { formats: "all", severity: "error", params: { maximum: 25, fullWidthRow: 0.6 } },
  evaluate({ snapshot, params }) {
    const start = contentStart(snapshot, params);
    if (start === null) return [];
    const share = Math.round((start / snapshot.viewport.height) * 100);
    return share > params.maximum ? [{ index: -1, value: share, threshold: params.maximum, line: start }] : [];
  },
};

/** Top of the first content element of the first screen height, or null when the screen shows none. */
export function contentStart(snapshot, params) {
  const width = snapshot.viewport.width;
  const height = snapshot.viewport.height;
  let start = null;
  snapshot.elements.forEach((entry) => {
    if (entry.chrome || entry.inHeader || entry.position === "fixed") return;
    const row = entry.interactive && !entry.insideInteractive && entry.rect.w >= width * params.fullWidthRow;
    const paragraph = entry.textRect && entry.textRect.lines >= 2 && !/^h[1-6]$/.test(entry.tag) && !entry.interactive;
    if (!entry.content && !row && !paragraph) return;
    const top = entry.visibleRect.y;
    if (top < 0 || top >= height || entry.visibleRect.h < 1) return;
    if (start === null || top < start) start = top;
  });
  return start;
}

export const chromeRows = {
  id: "chrome-rows",
  family: "sizing",
  kind: "element",
  title: "Rangées d'outils avant le contenu",
  explanation:
    "Nombre de rangées distinctes de commandes (boutons, onglets, champs, liens) empilées au-dessus du premier élément de contenu de l'écran.",
  unit: "rangées",
  defaults: { formats: "all", severity: "error", params: { maximum: 2, fullWidthRow: 0.6 } },
  evaluate({ snapshot, params }) {
    const start = contentStart(snapshot, params);
    if (start === null) return [];
    const bands = [];
    for (const entry of snapshot.elements) {
      if (!entry.interactive || entry.insideInteractive || entry.position === "fixed") continue;
      const { y, h } = entry.visibleRect;
      if (h < 1 || y < 0 || y + h > start + 1) continue;
      const middle = y + h / 2;
      if (!bands.some((band) => middle >= band.top && middle <= band.bottom)) bands.push({ top: y, bottom: y + h });
    }
    return bands.length > params.maximum ? [{ index: -1, value: bands.length, threshold: params.maximum }] : [];
  },
};

export const edgeMargin = {
  id: "edge-margin",
  family: "sizing",
  kind: "element",
  title: "Texte collé au bord de l'écran",
  explanation:
    "Le texte d'un élément commence ou finit à moins de la marge minimale du bord gauche ou droit de l'écran.",
  unit: "px",
  defaults: { formats: "all", severity: "error", params: { minimum: 8 } },
  evaluate({ snapshot, params }) {
    const width = snapshot.viewport.width;
    return snapshot.elements.flatMap((entry, index) => {
      if (!entry.textRect || entry.visibleRect.w < 1) return [];
      if (insideHorizontalScroller(snapshot, index)) return [];
      const left = entry.textRect.x;
      const right = width - (entry.textRect.x + entry.textRect.w);
      const margin = Math.min(left, right);
      if (margin >= params.minimum || margin < -1) return [];
      return [
        { index, value: Math.round(margin), threshold: params.minimum, detail: left < right ? "à gauche" : "à droite" },
      ];
    });
  },
};

export const textLineLength = {
  id: "text-line-length",
  family: "sizing",
  kind: "element",
  title: "Texte écrasé dans une colonne étroite",
  explanation:
    "Un paragraphe de plusieurs lignes compte en moyenne moins de caractères par ligne que le minimum : le texte est écrasé dans une colonne trop étroite.",
  unit: "car./ligne",
  defaults: { formats: "all", severity: "error", params: { minimum: 25, minimumLines: 3 } },
  evaluate({ snapshot, params }) {
    return snapshot.elements.flatMap((entry, index) => {
      if (!entry.textRect || entry.textRect.lines < params.minimumLines || entry.interactive) return [];
      const lines = Math.max(1, Math.round(entry.textRect.h / entry.lineHeight));
      if (lines < params.minimumLines) return [];
      const perLine = Math.round(entry.text.length / lines);
      return perLine < params.minimum ? [{ index, value: perLine, threshold: params.minimum }] : [];
    });
  },
};

export const componentSizeConsistency = {
  id: "component-size-consistency",
  family: "sizing",
  kind: "cross-screen",
  title: "Même composant rendu à des tailles différentes",
  explanation:
    "Les commandes de même nature (même icône seule, ou même composant et même variante avec libellé) n'ont pas la même hauteur d'un écran à l'autre au même format. Est signalé chaque écran où la taille diffère de la taille la plus fréquente.",
  unit: "px",
  defaults: {
    formats: "all",
    severity: "error",
    params: { tolerance: 4, minimumScreens: 2, maximumControlHeight: 64 },
  },
  evaluateAll({ records, params }) {
    const groups = new Map();
    for (const record of records) {
      record.elements.forEach((entry, index) => {
        if (!entry.interactive || entry.insideInteractive || entry.rect.h < 1) return;
        // Multi-line fields and content panels take the height of their content; only controls are compared.
        if (entry.tag === "textarea" || entry.rect.h > params.maximumControlHeight) return;
        const signature = entry.iconOnly
          ? `icône seule ${entry.iconHash}`
          : entry.slot
            ? `${entry.slot} ${entry.variant} ${entry.size}`.trim()
            : null;
        if (!signature) return;
        const measure = entry.iconOnly ? Math.round(Math.max(entry.rect.w, entry.rect.h)) : Math.round(entry.rect.h);
        if (!groups.has(signature)) groups.set(signature, []);
        groups.get(signature).push({ screen: record.screen.id, index, measure });
      });
    }
    const findings = [];
    for (const [signature, members] of groups) {
      const byScreen = new Map();
      for (const member of members) {
        if (!byScreen.has(member.screen)) byScreen.set(member.screen, new Map());
        const sizes = byScreen.get(member.screen);
        if (!sizes.has(member.measure)) sizes.set(member.measure, member);
      }
      if (byScreen.size < params.minimumScreens) continue;
      const frequency = new Map();
      for (const sizes of byScreen.values())
        for (const size of sizes.keys()) frequency.set(size, (frequency.get(size) ?? 0) + 1);
      const [usual] = [...frequency.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
      for (const [screen, sizes] of byScreen)
        for (const [size, member] of sizes)
          if (Math.abs(size - usual) > params.tolerance)
            findings.push({
              screen,
              index: member.index,
              value: size,
              threshold: usual,
              detail: `${signature}, ${frequency.get(usual)} écran(s) à ${usual} px`,
            });
    }
    return findings;
  },
};

export const sizingRules = [
  pageHorizontalScroll,
  viewportOverflow,
  clippedContent,
  touchTargetSize,
  textSize,
  actionIconSize,
  truncatedWithoutEllipsis,
  nestedScroll,
  chromeHeight,
  chromeRows,
  edgeMargin,
  textLineLength,
  componentSizeConsistency,
];
