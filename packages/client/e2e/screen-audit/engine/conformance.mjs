/*
 * Browser functions of the width sweep that do not measure geometry: the width thresholds of the loaded style sheets,
 * the width of the content area, the long-text stress, and the rules that hold a screen to the design decisions of the
 * owner (document Maket « Hall 1.3 — Choix de design des composants », page 1). Each function runs in the page through
 * `page.evaluate`: it must not use anything outside its own body.
 */

/**
 * Decision rules of the sweep: the French title of a finding, and `expected`, the sentence an implementer reads before
 * touching the interface, in the present and in the positive. The sentence is what the tool says about the rule.
 */
export const conformanceRules = {
  "disclosure-chevron": {
    title: "Choix 14 : chevron ou triangle de dépliage",
    expected:
      "Un contenu se déplie sans chevron ni triangle : par le carré « + / − » devant sa ligne, un dossier par son icône.",
  },
  "disclosure-mark": {
    title: "Dépliage sans le carré « + / − »",
    expected:
      "Un contenu qui se déplie porte devant son titre ou sa ligne un carré « + » quand il est fermé, « − » quand il est ouvert (composant de dépliage) ; la barre latérale, les dossiers de Documents, les listes déroulantes, les menus et le fil d'Ariane gardent leur forme.",
  },
  "unlabelled-create": {
    title: "Choix 6 : « + » de création ou d'ajout sans libellé",
    expected: "Une commande de création ou d'ajout montre « + » suivi de son libellé.",
  },
  "filled-icon": {
    title: "Choix 1 et 9 : icône pleine",
    expected: "Toutes les icônes sont dessinées en trait.",
  },
  "icon-weight": {
    title: "Choix 9R : icône hors de la graisse normale",
    expected:
      "Les icônes sont dans la graisse normale de leur famille ; seule la destination courante d'une barre a un trait plus épais.",
  },
  "warm-tint": {
    title: "Charte : teinte chaude peinte sur l'habillage de l'interface (crème, orange, brun, ambre)",
    expected:
      "Aucune teinte chaude (crème, orange, brun, ambre) n'habille l'interface ; l'orange d'un état qui attend une action est un indicateur, et une couleur choisie par la personne est une donnée.",
  },
  "forbidden-text": {
    title: "Choix 16 : texte retiré (« Outlook », « espace de travail », « Tags »)",
    expected:
      "Les libellés nomment la fonction (« la messagerie de la commune », « Documents », « Étiquettes »), jamais le produit technique.",
  },
  "local-table": {
    title: "Choix 3 : tableau au lieu de la ligne de liste",
    expected:
      "Une liste d'objets est faite de lignes de liste (ListRow) ; un tableau n'apparaît que dans le contenu d'un document.",
  },
  "local-list": {
    title: "Choix 3 : liste locale au lieu de la ligne de liste",
    expected: "Une liste d'objets cliquables est faite de lignes de liste (ListRow).",
  },
  "field-form": {
    title: "Choix 12 : champ hors du composant Field (libellé dans le champ)",
    expected:
      "Un champ de saisie est dans un Field, son libellé écrit dans le champ ; seule la recherche a sa propre forme.",
  },
  "button-form": {
    title: "Choix 5 : bouton hors des quatre formes (plein bleu, teinté, rouge, sans fond)",
    expected: "Un bouton est plein bleu, bleu pâle, rouge plein ou sans fond, et n'a pas de contour.",
  },
  "single-primary": {
    title: "Choix 5 : plus d'un bouton principal plein dans un écran",
    expected: "Un écran ou une fenêtre a au plus un bouton plein bleu, pour son action principale.",
  },

  "font-family": {
    title: "Choix 10 : texte hors de la police Archivo",
    expected: "Tout le texte est en Archivo.",
  },
  "text-size": {
    title: "Choix 10 : texte de moins de 14 px sous le doigt, de 13 px à la souris",
    expected:
      "Le texte mesure au moins 14 px au doigt et 13 px à la souris ; un état s'écrit à 12 px dans sa pastille.",
  },
  "state-pill": {
    title: "État écrit avec un rond ou sans pastille",
    expected:
      "Un état s'écrit dans une pastille teintée, sans rond devant : vert acquis, orange en attente d'une action, rouge bloquant, gris neutre ou passé ; le bleu n'est pas une couleur d'état.",
  },

  "header-first-line": {
    title: "Choix 2 : commande dans la première ligne du bandeau",
    expected:
      "La première ligne du bandeau porte le chemin et les initiales ; sur un écran de liste, aussi « + Nouveau » ; au téléphone, les commandes d'un élément ouvert avec « Modifier » et « … ».",
  },
  "title-after-commands": {
    title: "Choix 2 : rangée de commandes entre la première ligne et le grand titre",
    expected:
      "Le grand titre suit directement la première ligne du bandeau ; les commandes d'un élément ouvert sont sur la ligne du titre.",
  },
  "search-on-item": {
    title: "Recherche ou filtre affiché sur un élément ouvert",
    expected:
      "Un élément ouvert n'affiche ni recherche ni filtre de son dossier ; un sélecteur qui cherche quoi rattacher est permis.",
  },
  "duplicate-command": {
    title: "Commande, titre ou état d'enregistrement en double dans une même fenêtre",
    expected: "Dans une fenêtre, chaque commande, chaque titre et l'état d'enregistrement apparaissent une seule fois.",
  },
  "bottom-bar": {
    title: "Choix 1 : barre du bas autre que cinq destinations avec icône et libellé",
    expected: "Au téléphone, la barre du bas montre cinq destinations, chacune avec son icône en trait et son libellé.",
  },
  "writing-modes": {
    title: "Choix 8B : « Modifier » et « Terminé » hors du téléphone, ou ensemble",
    expected:
      "Au téléphone, un texte se lit avec « Modifier » ou s'écrit avec « Terminé », jamais les deux à la fois ; à la tablette et à l'ordinateur, un texte s'ouvre directement en écriture, sans « Modifier » ni « Terminé ».",
  },

  "pointer-scale": {
    title: "Tailles à l'ordinateur : ligne de liste écrite plus grand que le menu",
    expected: "À la souris, le titre d'une ligne de liste est écrit à la taille du texte du menu.",
  },
  "component-unity": {
    title: "Unité visuelle : un composant partagé dessiné de plusieurs façons dans une même variante",
    expected:
      "Un composant garde le même texte, la même icône, la même hauteur, les mêmes marges et écarts sur tous les écrans et à toutes les largeurs, sauf entre ses variantes nommées.",
  },
  "button-icon-unity": {
    title: "Boutons de même forme sur un écran, les uns avec une icône, les autres sans",
    expected: "Sur un écran, les boutons à libellé de même forme ont tous une icône ou n'en ont aucun.",
  },
  "plus-not-add": {
    title: "« + » sur une commande qui n'ajoute ni ne crée",
    expected: "« + » marque seulement l'ajout et la création.",
  },
  "design-reference": {
    title: "Valeur de dessin différente du design (Maket)",
    expected:
      "Chaque composant prend les valeurs de dessin de « Hall 1.3 — Design de référence » (table design-reference.json).",
  },
  "form-field": {
    title: "Choix 12 : champ hors de la forme retenue (fond, filet, libellé, « Non renseigné »)",
    expected:
      "Un champ n'a pas de fond, un filet dessous seulement (gris au repos, bleu et plus épais en saisie, rouge et plus épais en erreur, aucun en lecture seule), son libellé au-dessus, et écrit « Non renseigné » quand il est vide.",
  },
  "section-header": {
    title: "En-tête de section : commandes hors de l'extrémité droite, ou titres de sections de tailles différentes",
    expected:
      "Un en-tête de section porte son titre à gauche et ses commandes à l'extrémité droite de la même ligne ; tous les titres de section d'un écran ont la même taille et la même graisse.",
  },
  "menu-icons": {
    title: "Barre latérale : deux entrées avec la même icône",
    expected: "Chaque entrée de la barre latérale a une icône qui lui est propre.",
  },
  "date-format": {
    title: "Date écrite en chiffres ou avec l'année en cours",
    expected:
      "Une date s'écrit en toutes lettres, jour et mois (« 17 octobre ») ; l'année n'est écrite que si ce n'est pas l'année en cours.",
  },
  "header-line-height": {
    title: "Première ligne du bandeau hors de 44 px",
    expected: "Sur ordinateur et tablette, la première ligne du bandeau mesure 44 px.",
  },
  "item-more-menu": {
    title: "Menu « … » des commandes d'un élément ouvert hors du téléphone",
    expected:
      "À la tablette et à l'ordinateur, les commandes d'un élément ouvert sont des icônes visibles sur la ligne du titre, sans menu « … » ; le téléphone garde son menu « … ».",
  },

  "create-position": {
    title: "« + Nouveau » flottant hors du coin bas droit",
    expected: "Au téléphone, « + Nouveau » flotte en bas à droite de l'écran, au-dessus de la barre du bas.",
  },
  "type-icon-pad": {
    title: "Icône de type posée sur un pavé",
    expected: "L'icône de type d'une ligne de liste est posée seule, en trait, sans pavé ni fond.",
  },
  "large-row": {
    title: "Liste courte des personnes hors de la grande ligne",
    expected:
      "Une liste courte de personnes, comme la composition du conseil, emploie la grande ligne : initiales et nom plus grands, nom en gras.",
  },
  "editor-tools": {
    title: "Choix 8B : outils d'écriture hors de leur barre fixe sous le bandeau",
    expected:
      "Au téléphone, en écriture, une seule barre d'outils est fixée sous le bandeau et porte « Photo » ; en lecture, aucune barre d'outils ni bouton photo n'est affiché.",
  },
  "menu-item-wrap": {
    title: "Ligne de menu écrite sur plusieurs lignes",
    expected: "Chaque ligne d'un menu tient sur une seule ligne de texte, à toutes les largeurs.",
  },
  "row-height": {
    title: "Choix 11 : hauteur d'une ligne de liste hors de 64 px (doigt) ou 40 et 52 px (souris)",
    expected: "Une ligne de liste mesure 64 px au doigt ; à la souris, 40 px sur une ligne et 52 px sur deux.",
  },
};

/**
 * Width thresholds of the style sheets loaded in the page: viewport `@media` and `@container` queries on the width.
 * Each threshold is normalised to the first width of the range it opens: `min-width: 761px` and `max-width: 760px`
 * both open a range at 761 px. Returns `[{ kind, breakpoint, query, source, container }]`.
 */
export function readBreakpoints() {
  const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const toPx = (value, unit) => (unit === "rem" || unit === "em" ? value * root : value);
  const found = [];
  const sourceOf = (sheet) =>
    sheet.ownerNode?.getAttribute?.("data-vite-dev-id")?.replace(/^.*\/packages\/client\//, "") ??
    sheet.href?.replace(/^.*\/(assets|src)\//, "$1/") ??
    "style";
  const parse = (text, kind, source, container) => {
    const patterns = [
      [/\(\s*min-width\s*:\s*([\d.]+)(px|rem|em)\s*\)/g, (v) => Math.ceil(v)],
      [/\(\s*max-width\s*:\s*([\d.]+)(px|rem|em)\s*\)/g, (v) => Math.floor(v) + 1],
      [/\(\s*width\s*>=\s*([\d.]+)(px|rem|em)\s*\)/g, (v) => Math.ceil(v)],
      [/\(\s*width\s*>\s*([\d.]+)(px|rem|em)\s*\)/g, (v) => Math.floor(v) + 1],
      [/\(\s*width\s*<=\s*([\d.]+)(px|rem|em)\s*\)/g, (v) => Math.floor(v) + 1],
      [/\(\s*width\s*<\s*([\d.]+)(px|rem|em)\s*\)/g, (v) => Math.ceil(v)],
    ];
    for (const [pattern, normalise] of patterns)
      for (const match of text.matchAll(pattern))
        found.push({
          kind,
          breakpoint: normalise(toPx(Number.parseFloat(match[1]), match[2])),
          query: text.trim(),
          source,
          container,
        });
  };
  const visit = (rules, source) => {
    for (const rule of rules) {
      if (rule instanceof CSSMediaRule) parse(rule.conditionText ?? rule.media.mediaText, "media", source, null);
      else if (typeof CSSContainerRule !== "undefined" && rule instanceof CSSContainerRule)
        parse(rule.containerQuery ?? rule.conditionText, "container", source, rule.containerName || null);
      if (rule.cssRules) visit(rule.cssRules, source);
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      visit(sheet.cssRules, sourceOf(sheet));
    } catch {
      /* a cross-origin sheet without CORS has no readable rules */
    }
  }
  const unique = new Map();
  for (const entry of found)
    unique.set(`${entry.kind}|${entry.breakpoint}|${entry.container}|${entry.source}|${entry.query}`, entry);
  return [...unique.values()];
}

/**
 * Widths of the containers named by container queries, with the viewport width: `[{ name, selector, width }]`.
 * A container without a name answers queries without a name.
 */
export function readContainers() {
  const keyOf = (element) => {
    const key = element.closest("[data-testid]")?.getAttribute("data-testid");
    return `${key ? `[${key}] › ` : ""}${element.tagName.toLowerCase()}${[...element.classList]
      .slice(0, 2)
      .map((name) => `.${name}`)
      .join("")}`;
  };
  const result = [];
  for (const element of document.querySelectorAll("body *")) {
    const style = getComputedStyle(element);
    if (!style.containerType || style.containerType === "normal") continue;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    result.push({
      names: style.containerName && style.containerName !== "none" ? style.containerName.split(/\s+/) : [],
      selector: keyOf(element),
      width: Math.round(rect.width * 100) / 100,
      viewport: window.innerWidth,
    });
  }
  return result;
}

/**
 * Widths of the content area (`[data-testid=application-main]`, else `main`), of the menu (`aside.app-sidebar`) and of
 * the module pane (`aside.module-pane`), as drawn: `{ content, menu, pane }`, null for an area that is not shown.
 */
export function readContentWidth() {
  const width = (selector) => {
    const element = document.querySelector(selector);
    if (!element || element.getClientRects().length === 0) return null;
    return Math.round(element.getBoundingClientRect().width);
  };
  return {
    content: width("[data-testid=application-main]") ?? width("main"),
    menu: width("aside.app-sidebar"),
    pane: width("aside.module-pane"),
  };
}

/**
 * Lengthens the names and titles of the page to the longest a council writes (a long first and last name, a long
 * business title, a long committee name), so that a row that only holds with short demonstration data fails.
 * Returns the number of texts lengthened.
 */
export function stretchTexts() {
  /* Data written by people: titles, names, the facts of a row, the values of a record. Labels of the interface keep
     their length. */
  const selector =
    "h1, h2, h3, .list-row-title, .list-row-detail, .list-row-fact, [class*=title], [class*=name], dd, td";
  const long = [
    "Commission des finances, du budget, des marchés publics et de l'administration générale",
    "Marie-Christine de La Tour-d'Auvergne-Lauraguais",
    "Aménagement des abris d'Alésia et réhabilitation de la salle polyvalente communale",
  ];
  let count = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
  for (const node of nodes) {
    const text = (node.textContent ?? "").trim();
    const parent = node.parentElement;
    if (!parent || text.length < 4 || /^[\d\s.,:/h–-]+$/.test(text)) continue;
    if (!parent.closest(selector) || parent.closest("svg, script, style, [contenteditable=true], .ol-viewport"))
      continue;
    if (
      parent.closest("button, [role=button], [role=tab], label, nav, .screen-header-trail") &&
      !parent.closest("[data-slot=list-row]")
    )
      continue;
    if (text.length >= 60) continue;
    node.textContent = long[count % long.length];
    count += 1;
  }
  return count;
}

/**
 * Measures the current page against the design decisions and returns its findings `{ rule, selector, detail }`.
 * Options: `ignoreSelectors`, `keyAttribute`, `touch` (finger input), `phone` (phone layout), `item` (the screen shows
 * one opened element), `fingerprints` (`{ d: "Name:weight" }` of the Phosphor icons).
 */
export function measureConformance(options) {
  const { ignoreSelectors, keyAttribute, touch, phone, item } = options;
  const fingerprints = options.fingerprints ?? window.__screenAuditIcons ?? {};
  const findings = [];
  /* Exceptions declared by the application, each with its reason: `{ rule: [{ selector, reason }] }`. */
  const exceptions = options.exceptions ?? {};
  const add = (rule, element, detail) => {
    if (typeof element !== "string" && (exceptions[rule] ?? []).some((entry) => element.closest(entry.selector)))
      return;
    findings.push({ rule, selector: selectorOf(element), detail });
  };
  const ignored = (element) => ignoreSelectors.some((selector) => element.closest(selector));
  const selectorOf = (element) => {
    if (typeof element === "string") return element;
    const parts = [];
    let current = element;
    while (current && current !== document.body && parts.length < 4) {
      const key = current.getAttribute(keyAttribute);
      if (key) {
        parts.unshift(`[${key.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}|\d{6,}/gi, "*")}]`);
        break;
      }
      const classes = [...current.classList].filter((name) => !/^(?:hover|focus|data-)/.test(name)).slice(0, 2);
      parts.unshift(current.tagName.toLowerCase() + classes.map((name) => `.${name}`).join(""));
      current = current.parentElement;
    }
    return parts.join(" › ");
  };
  const shown = (element) => {
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || Number.parseFloat(style.opacity) === 0) return false;
    if (element.closest("[aria-hidden=true], [inert], [hidden]")) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) return false;
    if (/^inset\(50%/.test(style.clipPath) || (style.position === "absolute" && style.clip.startsWith("rect(0")))
      return false;
    const closed = element.parentElement?.closest("details:not([open])");
    if (closed && !element.closest("summary")) return false;
    return element.getClientRects().length > 0;
  };
  const visibleText = (element) => {
    let text = "";
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest("svg") || !shown(parent)) continue;
      text += node.textContent ?? "";
    }
    return text.replace(/\s+/g, " ").trim();
  };
  const nameOf = (element) =>
    (element.getAttribute("aria-label") || visibleText(element) || element.getAttribute("title") || "").trim();
  const interactiveSelector =
    "a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=checkbox], [role=radio], [role=switch], [role=menuitem], [role=option], [role=combobox], [role=treeitem]";
  const commands = [...document.querySelectorAll(interactiveSelector)].filter(
    (element) => !ignored(element) && shown(element),
  );

  /* Colours: computed colours are rgb()/rgba() or color(srgb …). */
  const parseColor = (value) => {
    const numbers = (value.match(/[\d.]+/g) ?? []).map(Number);
    if (!numbers.length || value === "transparent") return null;
    let [r, g, b, a = 1] = numbers;
    if (value.startsWith("color(")) [r, g, b] = [r * 255, g * 255, b * 255];
    return { r, g, b, a };
  };
  const hsl = ({ r, g, b }) => {
    const [rr, gg, bb] = [r / 255, g / 255, b / 255];
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = max === rr ? (gg - bb) / d + (gg < bb ? 6 : 0) : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
    h *= 60;
    return { h, s, l };
  };
  const painted = (value) => {
    const color = parseColor(value);
    return color && color.a > 0.1 ? color : null;
  };
  const isWarm = (color) => {
    const { h, s, l } = hsl(color);
    return h >= 15 && h <= 65 && s >= 0.25 && l > 0.08 && l < 0.985;
  };
  const isBlue = (color) => {
    const { h, s } = hsl(color);
    return h >= 195 && h <= 255 && s >= 0.2;
  };
  const isRed = (color) => {
    const { h, s } = hsl(color);
    return (h >= 345 || h <= 12) && s >= 0.35;
  };
  const isNeutralFill = (color) => {
    const { s, l } = hsl(color);
    return s < 0.12 && l < 0.97;
  };

  /* Icons: an <svg> is identified by the `d` of its first path. */
  const iconOf = (svg) => fingerprints[svg.querySelector("path")?.getAttribute("d") ?? ""] ?? null;
  const svgs = [...document.querySelectorAll("svg")].filter((svg) => !ignored(svg) && shown(svg));

  for (const svg of svgs) {
    const icon = iconOf(svg);
    if (!icon) continue;
    const [name, weight] = icon.split(":");
    /* filled-icon: choices 1 and 9, every icon is drawn in outline. */
    if (weight === "fill" || weight === "duotone") add("filled-icon", svg, `${name} en poids ${weight}`);
    /* icon-weight: choice 9R, the regular weight of the family; the current destination of a bar is drawn bolder (1A). */
    if (
      ["bold", "light", "thin"].includes(weight) &&
      !svg.closest("[aria-current=page], [data-active=true], [data-current=true], .app-sidebar [data-open=true]")
    )
      add("icon-weight", svg, `${name} en poids ${weight}`);
    /* disclosure-chevron: choice 14, a section or a folder unfolds without a chevron or a triangle. */
    if (/^(Caret(Down|Right|Up|Left|Circle\w*)|Triangle)$/.test(name)) {
      const owner = svg.closest("[aria-expanded], summary, [role=treeitem]");
      const menu = owner?.matches("[aria-haspopup], [role=combobox], [data-slot=select-trigger]");
      if (owner && !menu) add("disclosure-chevron", owner, `${name} dans « ${nameOf(owner).slice(0, 40)} »`);
    }
    /* unlabelled-create: choice 6, a creation or an addition is « + » with its label. */
    if (/Plus$/.test(name) || name === "Plus") {
      const command = svg.closest("button, a[href], [role=button], [role=menuitem]");
      if (command && !visibleText(command)) add("unlabelled-create", command, `${name} sans libellé visible`);
    }
  }

  /* Texts: forbidden labels, font family and size, warm text colour. */
  const forbidden = [
    [/outlook/i, "« Outlook »"],
    [/espace de travail/i, "« espace de travail »"],
    [/\bTags?\b/, "« Tags »"],
  ];
  /* HALL-FR-LAY-020 and 050: 14 px under a finger, 13 px under a mouse, whatever the width. */
  const minimum = touch ? 14 : 13;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textParents = new Set();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    const parent = node.parentElement;
    if (!text || !parent || ignored(parent) || parent.closest("script, style, noscript, title, svg")) continue;
    if (!shown(parent)) continue;
    for (const [pattern, label] of forbidden)
      if (pattern.test(text)) add("forbidden-text", parent, `${label} dans « ${text.slice(0, 50)} »`);
    textParents.add(parent);
  }
  for (const parent of textParents) {
    const style = getComputedStyle(parent);
    if (!parent.closest("pre, code, kbd, samp, [contenteditable=true]")) {
      const family = style.fontFamily.split(",")[0].replace(/["']/g, "").trim();
      if (!/^archivo/i.test(family)) add("font-family", parent, `police ${family}`);
    }
    const size = Number.parseFloat(style.fontSize);
    // A state is written at 12 px in its pill (Design de référence, page 9, decision of 12 November 2026).
    const state = parent.closest(".list-row-status, .record-state, [data-save], [data-tone]");
    if (size + 0.01 < minimum && !state) add("text-size", parent, `${size} px pour ${minimum} px`);
  }

  /* warm-tint: no cream, orange, brown or amber painted on the screen. A colour the user chose (inline style) is data. */
  for (const element of document.querySelectorAll("body *")) {
    if (ignored(element) || element.closest("img, picture, video, canvas, iframe")) continue;
    if (/color|background|fill|stroke/.test(element.getAttribute("style") ?? "")) continue;
    // The orange of a state (waiting for an action) is an indicator, not the dressing of the interface.
    if (element.closest("[data-tone], [data-save], .record-state, .list-row-status")) continue;
    if (!shown(element)) continue;
    const style = getComputedStyle(element);
    const candidates = [["fond", style.backgroundColor]];
    if (textParents.has(element)) candidates.push(["texte", style.color]);
    if (element instanceof SVGElement) candidates.push(["trait", style.stroke], ["remplissage", style.fill]);
    for (const side of ["Top", "Right", "Bottom", "Left"])
      if (Number.parseFloat(style[`border${side}Width`]) >= 1 && style[`border${side}Style`] !== "none")
        candidates.push(["bordure", style[`border${side}Color`]]);
    for (const [where, value] of candidates) {
      const color = painted(value);
      if (color && isWarm(color)) {
        add("warm-tint", element, `${where} ${value}`);
        break;
      }
    }
  }

  /* local-table and local-list: choice 3, every list is drawn by ListRow. A table of a document's own content is data. */
  const contentOfDocument =
    "[contenteditable], .markdown-view, .markdown-editor, .ProseMirror, [data-horizontal-scroll]";
  for (const table of document.querySelectorAll("table")) {
    if (ignored(table) || table.closest(contentOfDocument) || !shown(table)) continue;
    add("local-table", table, `${table.querySelectorAll("tr").length} rangées`);
  }
  for (const list of document.querySelectorAll("ul, ol")) {
    if (ignored(list) || list.closest(contentOfDocument) || !shown(list)) continue;
    if (
      list.closest(
        "nav, [role=menu], [role=listbox], [role=tablist], [role=tree], [data-slot=list-row-list], [data-slot=list-row]",
      )
    )
      continue;
    const items = [...list.children].filter((child) => child.tagName === "LI" && shown(child));
    const actionable = items.filter(
      (entry) => entry.querySelector("a[href], button, [role=button]") && !entry.querySelector("[data-slot=list-row]"),
    );
    if (items.length >= 3 && actionable.length >= 3) add("local-list", list, `${actionable.length} éléments`);
  }

  /* field-form: choice 12D, a form field is a Field with its label inside it. */
  for (const control of document.querySelectorAll(
    "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]):not([type=color]):not([type=search]), textarea, select, [data-slot=select-trigger]",
  )) {
    if (ignored(control) || !shown(control) || control.closest(contentOfDocument)) continue;
    if (control.closest("[data-slot=field], [data-slot=search-input], [role=search], [data-slot=inline-rename]"))
      continue;
    if (
      /search|recherche|filtr/i.test(
        `${control.getAttribute(keyAttribute) ?? ""} ${control.getAttribute("aria-label") ?? ""}`,
      )
    )
      continue;
    add(
      "field-form",
      control,
      `${control.tagName.toLowerCase()} « ${(control.getAttribute("aria-label") ?? "").slice(0, 30)} »`,
    );
  }

  /* button-form and single-primary: choice 5B, solid blue for the one main action, pale blue, solid red, or no fill. */
  const primaries = new Map();
  for (const button of commands) {
    if (!button.matches("button, [role=button], a[data-slot=button]")) continue;
    if (button.closest("[data-slot=list-row], [role=tablist], [role=menu], [role=listbox], [role=tree], nav")) continue;
    const style = getComputedStyle(button);
    const fill = painted(style.backgroundColor);
    const border = ["Top", "Right", "Bottom", "Left"].some(
      (side) =>
        Number.parseFloat(style[`border${side}Width`]) >= 1 &&
        style[`border${side}Style`] !== "none" &&
        painted(style[`border${side}Color`]) &&
        style[`border${side}Color`] !== style.backgroundColor,
    );
    const label = nameOf(button).slice(0, 30);
    if (border) add("button-form", button, `bouton à contour « ${label} »`);
    else if (fill && isNeutralFill(fill))
      add("button-form", button, `bouton gris « ${label} » (${style.backgroundColor})`);
    else if (fill && !isBlue(fill) && !isRed(fill) && hsl(fill).l < 0.97)
      add("button-form", button, `bouton coloré hors charte « ${label} » (${style.backgroundColor})`);
    if (fill && isBlue(fill) && hsl(fill).l < 0.6 && fill.a > 0.9) {
      const scope = button.closest("[role=dialog]") ?? document.body;
      primaries.set(scope, [...(primaries.get(scope) ?? []), button]);
    }
  }
  for (const [scope, buttons] of primaries)
    if (buttons.length > 1)
      add(
        "single-primary",
        scope === document.body ? "écran" : scope,
        buttons.map((button) => `« ${nameOf(button).slice(0, 24)} »`).join(", "),
      );

  /* state-pill: a state is a tinted pill without a dot, never blue (decision of 12 November 2026, page 9). */
  for (const state of document.querySelectorAll(
    "[role=status], [data-save], [data-tone], .record-state, .list-row-status",
  )) {
    if (ignored(state) || !shown(state) || state.closest(interactiveSelector)) continue;
    const text = visibleText(state);
    if (!text || text.length > 40) continue;
    const before = getComputedStyle(state, "::before");
    const dot =
      before.content !== "none" &&
      before.content !== "normal" &&
      before.display !== "none" &&
      Number.parseFloat(before.width) > 0 &&
      painted(before.backgroundColor);
    if (dot) add("state-pill", state, `« ${text} » écrit après un rond`);
    const fill = painted(getComputedStyle(state).backgroundColor);
    if (!fill) add("state-pill", state, `« ${text} » sans pastille`);
    // The grey of a neutral state (#ECEFF3, #4A5362) leans slightly to blue: only a saturated blue is a blue state.
    else if (
      [fill, parseColor(getComputedStyle(state).color) ?? { r: 0, g: 0, b: 0 }].some(
        (color) => isBlue(color) && hsl(color).s >= 0.4,
      )
    )
      add("state-pill", state, `« ${text} » en bleu`);
  }

  /* header-first-line and title-after-commands: choice 2 and the rule of an opened element. */
  const header = document.querySelector("[data-testid=screen-header], [data-testid=phone-header]");
  const firstLine = header?.querySelector(".screen-header-line");
  /* On a phone, the commands of an opened element stay in the header with « Modifier » and « ⋯ » (HALL-FR-LAY-100, choice 8). */
  if (firstLine && shown(firstLine) && !phone) {
    const allowed =
      ".screen-header-trail, .screen-header-back, [data-testid=screen-header-account], [data-testid=navigation-toggle], [data-testid=application-sync-status], [data-testid=phone-header-back]";
    /* The creation of a list screen (« + Nouveau », HALL-FR-LAY-100 and 120) and the control that reopens a folded pane
       belong to the first line; an opened element has no command there. */
    const isCreate = (command) =>
      [...command.querySelectorAll("svg")].some((svg) => /Plus:/.test(iconOf(svg) ?? "")) && visibleText(command);
    for (const command of commands) {
      if (!firstLine.contains(command) || command.closest(allowed)) continue;
      if (command.closest("[data-testid=module-pane-open]") || (!item && isCreate(command))) continue;
      add("header-first-line", command, `« ${nameOf(command).slice(0, 30)} »${item ? " sur un élément ouvert" : ""}`);
    }
    const title = [...document.querySelectorAll("h1")].find(
      (heading) => shown(heading) && !firstLine.contains(heading),
    );
    if (title) {
      const lineBottom = firstLine.getBoundingClientRect().bottom;
      const titleTop = title.getBoundingClientRect().top;
      const between = commands.filter((command) => {
        const rect = command.getBoundingClientRect();
        const middle = (rect.top + rect.bottom) / 2;
        // Only the commands of the content column: the menu beside it is not between the first line and the title.
        return (
          middle > lineBottom &&
          middle < titleTop &&
          rect.left >= firstLine.getBoundingClientRect().left - 1 &&
          !command.closest(".screen-header-trail")
        );
      });
      if (between.length)
        add(
          "title-after-commands",
          title,
          `${between.length} commande(s) au-dessus du titre : ${between
            .slice(0, 4)
            .map((command) => `« ${nameOf(command).slice(0, 20)} »`)
            .join(", ")}`,
        );
    }
  }

  /* search-on-item: an opened element shows no search or filter of its folder. */
  if (item) {
    for (const control of document.querySelectorAll(
      "input[type=search], [data-slot=search-input] input, [role=search] input",
    )) {
      // A picker that looks up what to attach (a combobox) is not a search of the folder.
      if (ignored(control) || !shown(control) || control.closest("[role=dialog]") || control.matches("[role=combobox]"))
        continue;
      add(
        "search-on-item",
        control,
        `« ${(control.getAttribute("placeholder") ?? control.getAttribute("aria-label") ?? "").slice(0, 30)} »`,
      );
    }
  }

  /* duplicate-command: in one window (the screen header and title, or a dialog), a command, a heading or a save state appears once. */
  const windows = [...document.querySelectorAll("[role=dialog]")].filter(shown);
  const screenParts = [header, document.querySelector(".screen-title-block")].filter(Boolean);
  const scopes = [
    { name: "bandeau", contains: (element) => screenParts.some((part) => part.contains(element)) },
    ...windows.map((dialog) => ({ name: selectorOf(dialog), contains: (element) => dialog.contains(element) })),
  ];
  for (const scope of scopes) {
    const inScope = (element) =>
      scope.contains(element) &&
      !element.closest("[data-slot=list-row], [role=tree], [role=menu], [role=listbox], nav");
    const names = new Map();
    for (const command of commands.filter(inScope)) {
      const name = nameOf(command).toLowerCase();
      if (name.length < 2) continue;
      names.set(name, [...(names.get(name) ?? []), command]);
    }
    for (const [name, list] of names)
      if (list.length > 1)
        add("duplicate-command", list[1], `commande « ${name.slice(0, 30)} » ${list.length} fois (${scope.name})`);
    const headings = new Map();
    for (const heading of document.querySelectorAll("h1, h2, [data-slot=dialog-title]")) {
      if (!inScope(heading) || !shown(heading)) continue;
      const text = visibleText(heading).toLowerCase();
      if (!text) continue;
      headings.set(text, [...(headings.get(text) ?? []), heading]);
    }
    for (const [text, list] of headings)
      if (list.length > 1)
        add("duplicate-command", list[1], `titre « ${text.slice(0, 30)} » ${list.length} fois (${scope.name})`);
    const saves = [...document.querySelectorAll("[data-save], .save-status-indicator")].filter(
      (element) => inScope(element) && shown(element),
    );
    if (saves.length > 1)
      add("duplicate-command", saves[1], `état d'enregistrement ${saves.length} fois (${scope.name})`);
  }

  /* bottom-bar: choice 1A, five destinations with an outline icon and a permanent label. */
  if (phone) {
    const bar = document.querySelector("[data-testid=phone-navigation], nav.app-phone-bar, .app-phone-bar");
    if (bar && shown(bar)) {
      const destinations = [...bar.querySelectorAll("a[href], button")].filter(shown);
      const labelled = destinations.filter((entry) => visibleText(entry) && entry.querySelector("svg"));
      if (destinations.length !== 5 || labelled.length !== destinations.length)
        add("bottom-bar", bar, `${destinations.length} destinations, ${labelled.length} avec icône et libellé`);
    }
  }

  /* button-icon-unity and plus-not-add: the labelled buttons of one form (variant and size) on one screen are all drawn
     with an icon or all without; « + » marks an addition or a creation only (choice 6). */
  const addition = /nouveau|nouvelle|ajouter|joindre|créer|inviter|importer/i;
  const labelled = commands.filter(
    (button) =>
      button.matches("[data-slot=button]") &&
      visibleText(button) &&
      !button.closest(
        "[data-slot=list-row], [role=menu], [role=listbox], [role=tablist], [role=radiogroup], [role=group], [data-slot=search-input], [role=search], nav, .create-fab",
      ) &&
      // A segment of a choice of view is not a command of the same rank as the commands around it.
      !button.matches("[aria-pressed], [role=radio], [data-state=on], [data-state=off]"),
  );
  const forms = new Map();
  for (const button of labelled) {
    const scope = button.closest("[role=dialog]") ?? document.body;
    const icons = [...button.querySelectorAll("svg")].map((svg) => iconOf(svg) ?? "icône");
    const plus = icons.some((icon) => /Plus:/.test(icon));
    if (plus && !addition.test(visibleText(button)))
      add("plus-not-add", button, `« + » sur « ${visibleText(button).slice(0, 30)} »`);
    if (plus) continue;
    const key = `${button.getAttribute("data-variant")}|${button.getAttribute("data-size")}`;
    const form = forms.get(scope) ?? new Map();
    const sides = form.get(key) ?? { with: [], without: [] };
    sides[icons.length ? "with" : "without"].push(button);
    form.set(key, sides);
    forms.set(scope, form);
  }
  for (const form of forms.values())
    for (const [key, sides] of form)
      if (sides.with.length && sides.without.length)
        for (const button of sides.with)
          add(
            "button-icon-unity",
            button,
            `« ${visibleText(button).slice(0, 30)} » a une icône, « ${visibleText(sides.without[0]).slice(0, 30)} » n'en a pas (bouton ${key.split("|")[0]})`,
          );

  /* writing-modes: choice 8B, a text is read with « Modifier » or written with « Terminé », never both. */
  const editing = commands.filter((command) => command.matches("[data-testid=text-edit]"));
  const finishing = commands.filter((command) => command.matches("[data-testid=text-finish-editing]"));
  if (phone && editing.length && finishing.length)
    add("writing-modes", finishing[0], "« Modifier » et « Terminé » visibles ensemble");
  if (!phone)
    for (const command of [...editing, ...finishing])
      add("writing-modes", command, `« ${nameOf(command).slice(0, 20)} » hors du téléphone`);

  /* pointer-scale: under a mouse, the content comes down to the size of the menu and the header (12 November 2026). */
  if (!touch && !phone) {
    const menuLabel = [...document.querySelectorAll(".app-sidebar .nav-label")].find(shown);
    if (menuLabel) {
      const menuSize = Number.parseFloat(getComputedStyle(menuLabel).fontSize);
      for (const title of document.querySelectorAll("[data-slot=list-row] .list-row-title")) {
        if (ignored(title) || !shown(title) || title.closest("[data-prominent=true], [data-size=large]")) continue;
        const size = Number.parseFloat(getComputedStyle(title).fontSize);
        if (size > menuSize + 0.01) {
          add("pointer-scale", title, `${size} px pour ${menuSize} px dans le menu`);
          break;
        }
      }
    }
  }

  /* section-header: the commands of a section header at the right end of its line; one size and weight of title. */
  const sectionHeaders = [
    ...document.querySelectorAll(
      ".collapsible-section-header, .admin-section-heading, section > header, [class*=section-heading], [class*=section-header]",
    ),
  ].filter(
    (head) =>
      !ignored(head) &&
      shown(head) &&
      !head.closest("[data-testid=screen-header], [data-testid=phone-header], [role=dialog], nav") &&
      head.querySelector(":scope h2, :scope h3, :scope > * > h2, :scope > * > h3"),
  );
  const titleLooks = new Map();
  for (const head of sectionHeaders) {
    const title = head.querySelector("h2, h3");
    const titleStyle = getComputedStyle(title);
    const look = `${titleStyle.fontSize} ${titleStyle.fontWeight}`;
    titleLooks.set(look, [...(titleLooks.get(look) ?? []), title]);
    const titleRect = title.getBoundingClientRect();
    const box = head.getBoundingClientRect();
    const right = box.right - Number.parseFloat(getComputedStyle(head).paddingRight);
    const own = commands.filter(
      (command) => head.contains(command) && !title.contains(command) && !command.closest("[data-slot=list-row]"),
    );
    const sameLine = own.filter((command) => {
      const rect = command.getBoundingClientRect();
      return rect.top < titleRect.bottom && rect.bottom > titleRect.top;
    });
    if (!sameLine.length) continue;
    const last = Math.max(...sameLine.map((command) => command.getBoundingClientRect().right));
    if (right - last > 2)
      add(
        "section-header",
        head,
        `commandes finissant à ${Math.round(last - box.left)} px d'un en-tête de ${Math.round(box.width)} px`,
      );
  }
  if (titleLooks.size > 1)
    add(
      "section-header",
      [...titleLooks.values()][1][0],
      `titres de section en ${[...titleLooks.entries()].map(([look, titles]) => `${look} (${titles.length})`).join(", ")}`,
    );

  /* menu-icons: each entry of the side menu draws its own icon. */
  const drawings = new Map();
  for (const row of document.querySelectorAll(".app-sidebar .nav-row")) {
    if (ignored(row) || !shown(row)) continue;
    const path = row.querySelector("svg path")?.getAttribute("d");
    if (!path) continue;
    drawings.set(path, [...(drawings.get(path) ?? []), row]);
  }
  for (const rows of drawings.values())
    if (rows.length > 1) add("menu-icons", rows[1], `même icône que « ${nameOf(rows[0]).slice(0, 30)} »`);

  /* date-format: a date in letters, the current year left out. */
  const months = "janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre";
  const year = new Date().getFullYear();
  for (const parent of textParents) {
    if (
      parent.closest(
        "input, textarea, [contenteditable], .markdown-view, .markdown-editor, pre, code, [data-horizontal-scroll]",
      )
    )
      continue;
    const text = parent.textContent ?? "";
    if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(text))
      add("date-format", parent, `date en chiffres : « ${text.trim().slice(0, 40)} »`);
    else if (new RegExp(`\\b\\d{1,2}(?:er)? (?:${months}) ${year}\\b`).test(text))
      add("date-format", parent, `année en cours écrite : « ${text.trim().slice(0, 40)} »`);
  }

  /* header-line-height: on a computer and a tablet, a first line of 44 px and a breadcrumb without a chevron. */
  const line = document.querySelector("[data-testid=screen-header] > .screen-header-line");
  if (line && shown(line) && !phone) {
    const height = line.getBoundingClientRect().height;
    if (Math.abs(height - 44) > 1) add("header-line-height", line, `${Math.round(height)} px`);
    /* The chevron after a segment of the breadcrumb opens its menu (decision of 12 November 2026). */
  }

  /* disclosure-mark: decision of 12 November 2026 (Design de référence, page 10, choice C), one folding form. */
  const markExceptions = [
    ".app-sidebar",
    "[role=treeitem]",
    "[data-testid^=workspace-tree]",
    "[aria-haspopup]",
    "[role=combobox]",
    "[data-slot=select-trigger]",
    "select",
    "[role=menuitem]",
    "nav[aria-label] ol",
    ".breadcrumb, [data-testid*=breadcrumb]",
  ].join(", ");
  const drawn = (element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1 && getComputedStyle(element).display !== "none";
  };
  for (const toggle of document.querySelectorAll("[aria-expanded], summary")) {
    if (ignored(toggle) || toggle.closest(markExceptions) || !drawn(toggle)) continue;
    if (!shown(toggle)) continue;
    const label = nameOf(toggle).slice(0, 40);
    const badge = toggle.querySelector(".disclosure-badge");
    if (!badge || !drawn(badge)) {
      add("disclosure-mark", toggle, `« ${label} » sans carré « + / − »`);
      continue;
    }
    const open = toggle.matches("summary")
      ? Boolean(toggle.parentElement?.open)
      : toggle.getAttribute("aria-expanded") === "true";
    const plus = badge.querySelector(".disclosure-badge-plus");
    const minus = badge.querySelector(".disclosure-badge-minus");
    const sign = minus && drawn(minus) ? "−" : plus && drawn(plus) ? "+" : "rien";
    if (sign !== (open ? "−" : "+"))
      add("disclosure-mark", toggle, `« ${label} » ${open ? "ouvert" : "fermé"} montre « ${sign} »`);
    const first = [...toggle.querySelectorAll("*")].find((child) => drawn(child) && child.childElementCount === 0);
    if (first && !badge.contains(first) && first.getBoundingClientRect().left < badge.getBoundingClientRect().left - 1)
      add("disclosure-mark", toggle, `« ${label} » : le carré n'est pas devant la ligne`);
  }

  /* item-more-menu: on a tablet and a computer, an opened item shows its commands as icons, without « … ». */
  if (!phone && item)
    for (const more of commands.filter((command) => command.matches("[data-testid=item-commands-more]")))
      add("item-more-menu", more, "menu « … » sur la ligne du titre");

  /* create-position: on a phone, the floating « + Nouveau » at the bottom right, above the bottom bar. */
  if (phone) {
    const fab = [...document.querySelectorAll(".create-fab")].find(shown);
    const bar = document.querySelector("[data-testid=phone-navigation]");
    if (fab) {
      const rect = fab.getBoundingClientRect();
      const floor = bar && shown(bar) ? bar.getBoundingClientRect().top : window.innerHeight;
      if (window.innerWidth - rect.right > 24 || floor - rect.bottom > 32 || rect.bottom > floor + 1)
        add(
          "create-position",
          fab,
          `à ${Math.round(window.innerWidth - rect.right)} px du bord droit et ${Math.round(floor - rect.bottom)} px au-dessus de la barre du bas`,
        );
    }
  }

  /* type-icon-pad: the type icon of a row stands alone, without a pad. */
  for (const glyph of document.querySelectorAll("[data-slot=list-row] .type-icon")) {
    if (ignored(glyph) || !shown(glyph)) continue;
    const fill = painted(getComputedStyle(glyph).backgroundColor);
    if (fill) add("type-icon-pad", glyph, `pavé ${getComputedStyle(glyph).backgroundColor}`);
  }

  /* large-row: the members of the council are listed in the large row. */
  for (const row of document.querySelectorAll("[data-slot=list-row]:has([data-testid^=member-open-])")) {
    if (ignored(row) || !shown(row)) continue;
    if (!row.matches("[data-size=large]")) add("large-row", row, "ligne courante au lieu de la grande ligne");
  }

  /* editor-tools: choice 8B, on a phone the tools of a text are one bar fixed under the header, with « Photo ». */
  if (phone) {
    const writing = commands.some((command) => command.matches("[data-testid=text-finish-editing]"));
    const reading = commands.some((command) => command.matches("[data-testid=text-edit]"));
    const band = document
      .querySelector("[data-testid=phone-header], [data-testid=screen-header]")
      ?.getBoundingClientRect();
    const toolbars = [...document.querySelectorAll("[role=toolbar]")].filter(
      (bar) =>
        !ignored(bar) && shown(bar) && !bar.closest("[data-testid=phone-header], [data-testid=screen-header], nav"),
    );
    const photos = [
      ...document.querySelectorAll(
        ".editor-photo-control, [data-testid=editor-choose-image], [data-testid=editor-take-photo]",
      ),
    ].filter((control) => !ignored(control) && shown(control));
    if (writing) {
      if (toolbars.length !== 1)
        add("editor-tools", toolbars[1] ?? "écran", `${toolbars.length} barres d'outils en écriture`);
      const bar = toolbars[0];
      for (const photo of photos)
        if (!bar?.contains(photo)) add("editor-tools", photo, "bouton photo hors de la barre d'outils");
      if (bar && band) {
        const position = getComputedStyle(bar).position;
        const top = bar.getBoundingClientRect().top;
        if (!["sticky", "fixed"].includes(position) || Math.abs(top - band.bottom) > 2)
          add(
            "editor-tools",
            bar,
            `barre en position ${position}, à ${Math.round(top)} px pour un bandeau qui finit à ${Math.round(band.bottom)} px`,
          );
      }
    } else if (reading) {
      for (const bar of toolbars) add("editor-tools", bar, "barre d'outils affichée en lecture");
      for (const photo of photos) add("editor-tools", photo, "bouton photo affiché en lecture");
    }
  }

  /* row-height: choice 11B, 64 px under a finger; 40 px or 52 px with two lines under a mouse. */
  for (const row of document.querySelectorAll("[data-slot=list-row]")) {
    if (ignored(row) || !shown(row) || row.matches("[data-prominent=true], [data-size=large]")) continue;
    // The line of the row, without the rows unfolded under it; a title written on two lines is another rule's matter.
    const line = row.querySelector(":scope > .list-row-line") ?? row;
    const title = line.querySelector(".list-row-title");
    if (title) {
      const titleStyle = getComputedStyle(title);
      const lineHeight = Number.parseFloat(titleStyle.lineHeight) || Number.parseFloat(titleStyle.fontSize) * 1.3;
      if (title.getBoundingClientRect().height > lineHeight * 1.6) continue;
    }
    const height = line.getBoundingClientRect().height;
    // Density follows the pointer: 64 px under a finger, 40 or 52 px under a mouse, whatever the width.
    const ok = touch ? height >= 63.5 : Math.abs(height - 40) <= 1 || Math.abs(height - 52) <= 1;
    if (!ok) add("row-height", row, `${Math.round(height * 10) / 10} px`);
  }

  const unique = new Map();
  for (const finding of findings) unique.set(`${finding.rule}|${finding.selector}`, finding);
  return [...unique.values()];
}

/**
 * Drawn measures of the shared components on the page, for the rule of visual unity: a component keeps the same text
 * size and weight, icon size, height, inner margins and gaps on every screen and at every width, except between the
 * variants the design declares. Returns `[{ component, variant, signature, selector }]`; `components` maps a component
 * name to `{ selector, part, variants }`, where `part` is the selector of the drawn line inside the element (or empty)
 * and `variants` lists the attributes that name a declared variant (`data-size`, `data-variant`, `data-compact`…), read
 * on the element or its nearest ancestor that carries them.
 */
export function readComponentUnity(options) {
  const { components, phone, touch } = options;
  const round = (value) => Math.round(Number.parseFloat(value) * 2) / 2 || 0;
  const shown = (element) => {
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none" || element.closest("[aria-hidden=true], [hidden]"))
      return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  };
  const keyOf = (element) => {
    const key = element.closest("[data-testid]")?.getAttribute("data-testid");
    return key ? `[${key.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}|\d{6,}/gi, "*")}]` : element.tagName.toLowerCase();
  };
  const result = [];
  for (const [component, definition] of Object.entries(components)) {
    const seen = new Set();
    for (const element of document.querySelectorAll(definition.selector)) {
      if (!shown(element)) continue;
      const line = definition.part ? (element.querySelector(definition.part) ?? element) : element;
      // A title written on two lines makes its row taller: the row is compared when its title holds on one line.
      const title = line.querySelector(".list-row-title");
      if (title) {
        const titleStyle = getComputedStyle(title);
        const lineHeight = Number.parseFloat(titleStyle.lineHeight) || Number.parseFloat(titleStyle.fontSize) * 1.3;
        if (title.getBoundingClientRect().height > lineHeight * 1.6) continue;
      }
      const style = getComputedStyle(line);
      const text =
        (definition.text === ":scope" ? line : definition.text && line.querySelector(definition.text)) ||
        [...line.querySelectorAll("*"), line].find((node) =>
          [...node.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim()),
        );
      const textStyle = text ? getComputedStyle(text) : style;
      const icon = definition.icon === "none" ? null : line.querySelector(definition.icon ?? "svg");
      const ownHeight = !(definition.contentHeight && element.matches(definition.contentHeight));
      const parts = [
        `texte ${round(textStyle.fontSize)} px ${textStyle.fontWeight}`,
        ...(icon ? [`icône ${round(icon.getBoundingClientRect().width)} px`] : []),
        ...(ownHeight ? [`hauteur ${round(line.getBoundingClientRect().height)} px`] : []),
        `marges ${round(style.paddingTop)} ${round(style.paddingRight)} ${round(style.paddingBottom)} ${round(style.paddingLeft)} px`,
        `écart ${style.display.includes("flex") || style.display.includes("grid") ? round(style.columnGap) : 0} px`,
      ];
      /* Where its commands sit: at the right end of its line, or elsewhere. */
      if (definition.commands) {
        const own = [...line.querySelectorAll(definition.commands)].filter(
          (command) => command.getClientRects().length,
        );
        if (own.length) {
          const boxRight = line.getBoundingClientRect().right - Number.parseFloat(style.paddingRight);
          const last = Math.max(...own.map((command) => command.getBoundingClientRect().right));
          parts.push(`commandes ${boxRight - last <= 2 ? "à l'extrémité droite" : "ailleurs que l'extrémité droite"}`);
        }
      }
      /* Kinds the design names (a row on two lines, a list of choices, the active entry) are variants of their own. */
      const kinds = (definition.kinds ?? [])
        .filter(([selector]) => element.matches(selector) || element.querySelector(selector))
        .map(([, label]) => label);
      const declared = (definition.variants ?? [])
        .map((attribute) => {
          const owner = element.closest(`[${attribute}]`);
          return owner ? `${attribute}=${owner.getAttribute(attribute)}` : "";
        })
        .filter(Boolean)
        .join(" ");
      /* Declared variants: the phone layout, the pointer (density follows it), the named sizes and kinds; an icon or
         none is the content of the component, not its drawing. */
      const variant = [
        phone ? "téléphone" : "ordinateur",
        touch ? "doigt" : "souris",
        declared,
        ...kinds,
        icon ? "avec icône" : "",
      ]
        .filter(Boolean)
        .join(", ");
      const signature = parts.join(" · ");
      if (seen.has(`${variant}|${signature}`)) continue;
      seen.add(`${variant}|${signature}`);
      result.push({ component, variant, signature, selector: keyOf(element) });
    }
  }
  return result;
}

/**
 * Groups the drawn measures of `readComponentUnity` by component and declared variant; a component drawn with more
 * than one signature in one variant is a finding `{ rule, screen, selector, detail, cases }`.
 */
export function unityFindings(entries, intervalLabel) {
  const byVariant = new Map();
  for (const entry of entries) {
    const key = `${entry.component} | ${entry.variant}`;
    const signatures = byVariant.get(key) ?? new Map();
    const cases = signatures.get(entry.signature) ?? { count: 0, examples: new Set() };
    cases.count += 1;
    if (cases.examples.size < 4)
      cases.examples.add(`${entry.screen} ${intervalLabel(entry.width)} (${entry.width} px), menu ${entry.menu}`);
    signatures.set(entry.signature, cases);
    byVariant.set(key, signatures);
  }
  const findings = [];
  for (const [key, signatures] of byVariant) {
    if (signatures.size < 2) continue;
    const ordered = [...signatures.entries()].sort((a, b) => b[1].count - a[1].count);
    findings.push({
      key: `* | component-unity | ${key}`,
      screen: "*",
      rule: "component-unity",
      selector: key,
      detail: `${signatures.size} dessins dans la même variante`,
      cases: ordered.map(
        ([signature, cases]) => `${signature} : ${cases.count} mesures, par exemple ${[...cases.examples].join(" ; ")}`,
      ),
    });
  }
  return findings;
}

/**
 * Compares the computed styles of the page with the values the design fixed (`entries` of a design reference table:
 * `{ component, selector, pseudo?, property, expected, when, status, source }`). A colour is compared exactly, a
 * length within `tolerance.px`. Entries marked « contradiction » are not applied. `when` is `all`, `mouse`, `finger`,
 * `touch` (phone layout or finger) or `pointer-wide` (mouse above the phone layout). Returns findings `{ rule, selector, detail }`.
 */
export function measureDesignReference(options) {
  const { entries, tolerance, touch, phone, keyAttribute, ignoreSelectors } = options;
  const findings = [];
  const tactile = touch || phone;
  const shown = (element) => {
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none" || element.closest("[aria-hidden=true], [hidden]"))
      return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0.5 && rect.height > 0.5;
  };
  const keyOf = (element) => {
    const key = element.closest(`[${keyAttribute}]`)?.getAttribute(keyAttribute);
    const own = `${element.tagName.toLowerCase()}${[...element.classList]
      .slice(0, 2)
      .map((name) => `.${name}`)
      .join("")}`;
    return key ? `[${key.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}|\d{6,}/gi, "*")}] › ${own}` : own;
  };
  const hex = (value) => {
    const numbers = (value.match(/[\d.]+/g) ?? []).map(Number);
    if (value === "transparent" || numbers.length < 3) return "transparent";
    let [r, g, b, a = 1] = numbers;
    if (value.startsWith("color(")) [r, g, b] = [r * 255, g * 255, b * 255];
    if (a < 0.05) return "transparent";
    const part = (n) => Math.round(n).toString(16).padStart(2, "0").toUpperCase();
    return `#${part(r)}${part(g)}${part(b)}${a < 0.99 ? ` (opacité ${Math.round(a * 100)} %)` : ""}`;
  };
  for (const entry of entries) {
    if (entry.status === "contradiction") continue;
    if (entry.when === "touch" && !tactile) continue;
    if (entry.when === "pointer-wide" && tactile) continue;
    if (entry.when === "mouse" && touch) continue;
    if (entry.when === "finger" && !touch) continue;
    let checked = 0;
    for (const element of document.querySelectorAll(entry.selector)) {
      if (checked >= 12) break;
      if (ignoreSelectors.some((selector) => element.closest(selector)) || !shown(element)) continue;
      // An element under the pointer shows its hover state, not its drawing at rest.
      if (element.matches(":hover")) continue;
      checked += 1;
      const style = getComputedStyle(element, entry.pseudo ?? null);
      let actual;
      let ok;
      const range = String(entry.expected).match(/^([\d.]+)px\.\.([\d.]+)px$/);
      if (range) {
        const value = Number.parseFloat(style.getPropertyValue(entry.property));
        actual = `${Math.round(value * 10) / 10}px`;
        ok = value >= Number(range[1]) - tolerance.px && value <= Number(range[2]) + tolerance.px;
      } else if (/^border-(top|bottom)-color$/.test(entry.property)) {
        /* A rule between two rows is the bottom border of one or the top border of the next; an underline may be an
           inset shadow. Without any of them, the rule is missing. */
        const side = entry.property.split("-")[1];
        const other = side === "bottom" ? "top" : "bottom";
        const next = side === "bottom" ? element.nextElementSibling : element.previousElementSibling;
        const own =
          Number.parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0 &&
          style.getPropertyValue(`border-${side}-style`) !== "none";
        const nextStyle = next ? getComputedStyle(next) : null;
        const shared =
          nextStyle &&
          Number.parseFloat(nextStyle.getPropertyValue(`border-${other}-width`)) > 0 &&
          nextStyle.getPropertyValue(`border-${other}-style`) !== "none";
        const inset = style.boxShadow.includes("inset") ? style.boxShadow.match(/rgba?\([^)]*\)/)?.[0] : null;
        actual = own
          ? hex(style.getPropertyValue(entry.property))
          : shared
            ? hex(nextStyle.getPropertyValue(`border-${other}-color`))
            : inset
              ? hex(inset)
              : next || side === "top"
                ? "aucun filet"
                : null;
        if (actual === null) continue;
        ok = actual.toUpperCase() === entry.expected.toUpperCase();
      } else if (entry.property === "height" || entry.property === "width") {
        const rect = element.getBoundingClientRect();
        const value = entry.pseudo ? Number.parseFloat(style[entry.property]) : rect[entry.property];
        actual = `${Math.round(value * 10) / 10}px`;
        ok = Math.abs(value - Number.parseFloat(entry.expected)) <= tolerance.px;
      } else if (/color$/.test(entry.property)) {
        actual = hex(style.getPropertyValue(entry.property));
        ok = actual.toUpperCase() === entry.expected.toUpperCase();
      } else if (entry.property === "font-family") {
        actual = style.fontFamily.split(",")[0].replace(/["']/g, "").trim();
        ok = actual.toLowerCase().startsWith(entry.expected.toLowerCase());
      } else if (entry.property === "font-weight") {
        actual = style.fontWeight;
        ok = Number(actual) === Number(entry.expected);
      } else {
        actual = style.getPropertyValue(entry.property);
        ok = Math.abs(Number.parseFloat(actual) - Number.parseFloat(entry.expected)) <= tolerance.px;
      }
      if (ok) continue;
      findings.push({
        rule: "design-reference",
        selector: `${entry.component} · ${entry.property}${entry.pseudo ? ` (${entry.pseudo})` : ""} · ${keyOf(element)}`,
        detail: `design ${entry.expected} (Maket « ${entry.source.doc} » p. ${entry.source.page}, ${entry.source.element}), mesuré ${actual}`,
      });
    }
  }
  return findings;
}

/**
 * Form fields held to their retained form (`field`: `{ rest, focus, error }` rules as `{ color, width }`, `empty` text,
 * colour and style, `label` colour): no fill; a rule underneath only, its colour and thickness by state, none when the
 * field is read only; the label above the value, the value aligned on the edge of the rule; an empty field writes
 * `empty.text`. One editable field of the page is focused to read its rule while writing, then left. Returns findings.
 */
export async function measureFormFields(options) {
  const { field, keyAttribute, ignoreSelectors } = options;
  const findings = [];
  const hex = (value) => {
    const numbers = (value.match(/[\d.]+/g) ?? []).map(Number);
    if (value === "transparent" || numbers.length < 3) return "transparent";
    let [r, g, b, a = 1] = numbers;
    if (value.startsWith("color(")) [r, g, b] = [r * 255, g * 255, b * 255];
    if (a < 0.05) return "transparent";
    const part = (n) => Math.round(n).toString(16).padStart(2, "0").toUpperCase();
    return `#${part(r)}${part(g)}${part(b)}`;
  };
  const keyOf = (element) => {
    const key = element.closest(`[${keyAttribute}]`)?.getAttribute(keyAttribute);
    return key ? `[${key.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}|\d{6,}/gi, "*")}]` : element.tagName.toLowerCase();
  };
  const add = (element, what, expected, measured) =>
    findings.push({
      rule: "form-field",
      selector: `${what} · ${keyOf(element)}`,
      detail: `attendu ${expected}, mesuré ${measured}`,
    });
  const shown = (element) => {
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none" || element.closest("[aria-hidden=true], [hidden]"))
      return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  };
  /** The rule under a control: its bottom border, or an inset shadow drawn at its bottom. */
  const ruleOf = (element) => {
    const style = getComputedStyle(element);
    const border = Number.parseFloat(style.borderBottomWidth);
    if (border > 0 && style.borderBottomStyle !== "none" && hex(style.borderBottomColor) !== "transparent")
      return { color: hex(style.borderBottomColor), width: Math.round(border * 10) / 10 };
    for (const shadow of style.boxShadow.split(/,(?![^(]*\))/)) {
      if (!shadow.includes("inset")) continue;
      const color = shadow.match(/(rgba?|color)\([^)]*\)/)?.[0];
      const lengths = shadow
        .replace(/(rgba?|color)\([^)]*\)/, "")
        .match(/-?[\d.]+px/g)
        ?.map(Number.parseFloat);
      if (!color || !lengths || lengths.length < 2 || lengths[1] >= 0 || hex(color) === "transparent") continue;
      return { color: hex(color), width: Math.round(-lengths[1] * 10) / 10 };
    }
    return null;
  };
  const describe = (rule) => (rule ? `${rule.color} sur ${rule.width} px` : "aucun filet");
  const same = (rule, expected) =>
    expected === null
      ? rule === null
      : Boolean(rule) && rule.color === expected.color && Math.abs(rule.width - expected.width) <= 0.5;

  const controls = [
    ...document.querySelectorAll(
      ".hall-field > :is(.hall-input, .hall-textarea, .hall-select-trigger, .hall-field-value, .hall-field-composite)",
    ),
  ].filter((control) => !ignoreSelectors.some((selector) => control.closest(selector)) && shown(control));
  let focused = false;
  for (const control of controls) {
    const box = control.closest(".hall-field");
    const style = getComputedStyle(control);
    const input = control.matches("input, textarea") ? control : control.querySelector("input, textarea");
    const readOnly =
      control.matches(".hall-field-value") ||
      Boolean(input && (input.readOnly || input.disabled)) ||
      control.matches(":disabled");
    const invalid = control.matches("[aria-invalid=true]") || Boolean(input?.matches("[aria-invalid=true]"));
    if (hex(style.backgroundColor) !== "transparent") add(control, "fond", "aucun", hex(style.backgroundColor));
    const rule = ruleOf(control);
    const expected = readOnly ? null : invalid ? field.error : field.rest;
    if (!same(rule, expected))
      add(
        control,
        readOnly ? "filet en lecture seule" : invalid ? "filet en erreur" : "filet au repos",
        describe(expected),
        describe(rule),
      );
    /* Label above the value, the value on the edge of the rule. */
    const label = box.querySelector(":scope > .hall-field-label");
    if (label && shown(label)) {
      const labelRect = label.getBoundingClientRect();
      const text = input ?? control;
      const textLeft = text.getBoundingClientRect().left + Number.parseFloat(getComputedStyle(text).paddingLeft);
      const ruleLeft = control.getBoundingClientRect().left;
      if (Math.abs(textLeft - ruleLeft) > 1)
        add(control, "texte aligné sur le filet", `${Math.round(ruleLeft)} px`, `${Math.round(textLeft)} px`);
      if (Math.abs(labelRect.left - ruleLeft) > 1)
        add(label, "libellé aligné sur le filet", `${Math.round(ruleLeft)} px`, `${Math.round(labelRect.left)} px`);
      const valueTop =
        (input ?? control).getBoundingClientRect().top +
        Number.parseFloat(getComputedStyle(input ?? control).paddingTop);
      if (labelRect.bottom > valueTop + 1 && labelRect.top >= valueTop - 1)
        add(label, "libellé au-dessus de la valeur", "au-dessus", "sous la valeur");
      const labelColor = hex(getComputedStyle(label).color);
      if (!invalid && document.activeElement !== input && labelColor !== field.label)
        add(label, "couleur du libellé", field.label, labelColor);
    }
    /* An empty field writes « Non renseigné », grey and italic. */
    const empty = input
      ? input.value === ""
      : !(control.textContent ?? "").trim() || Boolean(control.querySelector(".hall-field-empty"));
    if (empty) {
      if (input) {
        const placeholder = input.getAttribute("placeholder") ?? "";
        const look = getComputedStyle(input, "::placeholder");
        if (placeholder !== field.empty.text)
          add(control, "champ vide", `« ${field.empty.text} »`, placeholder ? `« ${placeholder} »` : "rien");
        else if (hex(look.color) !== field.empty.color || look.fontStyle !== "italic")
          add(control, "champ vide", `${field.empty.color} en italique`, `${hex(look.color)} ${look.fontStyle}`);
      } else {
        const mark = control.querySelector(".hall-field-empty, [data-placeholder] [data-slot=select-value]") ?? control;
        const text = (mark.textContent ?? "").trim();
        const look = getComputedStyle(mark);
        if (text !== field.empty.text)
          add(control, "champ vide", `« ${field.empty.text} »`, text ? `« ${text} »` : "rien");
        else if (hex(look.color) !== field.empty.color || look.fontStyle !== "italic")
          add(control, "champ vide", `${field.empty.color} en italique`, `${hex(look.color)} ${look.fontStyle}`);
      }
    }
    /* While writing: one editable field is focused, measured, then left. */
    if (!focused && input && !readOnly && !invalid) {
      focused = true;
      const previous = document.activeElement;
      input.focus({ preventScroll: true });
      // The rule may be drawn by a transition: wait for its end before reading it.
      const target = control.matches(".hall-field-composite") ? control : input;
      const duration = Math.max(
        0,
        ...getComputedStyle(target)
          .transitionDuration.split(",")
          .map((value) => Number.parseFloat(value) * (value.trim().endsWith("ms") ? 1 : 1000)),
      );
      await new Promise((done) => setTimeout(done, Math.min(duration, 600) + 50));
      const writing = ruleOf(control.matches(".hall-field-composite") ? control : input);
      if (!same(writing, field.focus)) add(control, "filet en saisie", describe(field.focus), describe(writing));
      input.blur();
      if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
    }
  }
  return findings;
}

/**
 * Lines of the open menus of the page: each item of a menu (`[role=menuitem]` and its checkbox and radio kinds)
 * holds its label on one line. Returns findings `{ rule, selector, detail }` and the number of items read.
 */
export function measureMenuLines(options) {
  const { keyAttribute } = options;
  const findings = [];
  let items = 0;
  const keyOf = (element) => {
    const key = element.closest(`[${keyAttribute}]`)?.getAttribute(keyAttribute);
    return key ? `[${key.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}|\d{6,}/gi, "*")}]` : element.tagName.toLowerCase();
  };
  for (const item of document.querySelectorAll(
    "[role=menu] :is([role=menuitem], [role=menuitemcheckbox], [role=menuitemradio])",
  )) {
    if (item.getClientRects().length === 0) continue;
    items += 1;
    const tops = new Set();
    const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!(node.textContent ?? "").trim() || node.parentElement?.closest("svg, kbd")) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) if (rect.width > 0) tops.add(Math.round(rect.top));
    }
    if (tops.size > 1)
      findings.push({
        rule: "menu-item-wrap",
        selector: keyOf(item),
        detail: `« ${(item.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40)} » sur ${tops.size} lignes`,
      });
  }
  return { findings, items };
}
