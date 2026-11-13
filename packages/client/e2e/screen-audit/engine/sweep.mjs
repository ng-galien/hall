/*
 * Width sweep of the screen audit: every screen is measured at close widths, in every state of its menu and panes,
 * by generic layout rules evaluated in the page. No screenshot is taken; a finding names the screen, the width, the
 * input, the states, the rule and a selector.
 */

/**
 * Layout rules of the sweep: the French title of a finding, and `expected`, the sentence an implementer reads before
 * touching the interface. The sentence is what the tool says about the rule; a rule without one fails the checks.
 */
export const sweepRules = {
  "hidden-name": {
    title: "Titre ou nom de largeur nulle ou coupé à moins de trois caractères",
    expected:
      "Chaque titre et chaque nom montrent au moins trois caractères ; un nom trop long finit par des points de suspension, et un nom tenu sur une ligne coupée par « … » donne son libellé entier au survol.",
  },
  overlap: {
    title: "Deux textes ou commandes qui se recouvrent",
    expected: "Deux textes ou commandes ne se recouvrent jamais ; seul un bouton flottant se pose sur le contenu.",
  },
  "horizontal-scroll": {
    title: "Défilement horizontal du document ou d'une zone",
    expected:
      "Ni la page ni aucune zone ne défile horizontalement, sauf un tableau de données marqué data-horizontal-scroll.",
  },
  "lone-wrap": {
    title: "Élément rejeté seul sous les autres éléments de sa rangée",
    expected:
      "Les éléments d'une rangée tiennent sur une ligne ou passent à la ligne par groupes entiers ; un flot libre d'étiquettes porte data-layout-flow ; au téléphone, une pastille d'état peut passer seule sur la dernière ligne.",
  },
  "off-screen": {
    title: "Texte ou commande hors de l'écran",
    expected: "Chaque texte et chaque commande restent dans la largeur de l'écran.",
  },
  "under-header": {
    title: "Élément du contenu recouvert par le bandeau",
    expected: "Au chargement d'un écran, aucun élément du contenu ne passe sous le bandeau.",
  },
  "touch-target": {
    title: "Cible tactile de moins de 44 px au téléphone",
    expected: "Au doigt, sur téléphone, chaque commande offre une cible d'au moins 44 px.",
  },
};

/**
 * Intervals between width thresholds. A threshold is the first width of the range it opens (`min-width: 761px` and
 * `max-width: 760px` both open a range at 761 px). Returns `[{ from, to }]` covering `low` to `high`, in order; the sweep
 * measures both ends of each interval, which are also the two widths framing each threshold.
 */
export function intervalsOf(breakpoints, low, high) {
  const inside = [...new Set(breakpoints)].filter((value) => value > low && value <= high).sort((a, b) => a - b);
  const starts = [low, ...inside];
  return starts.map((from, index) => ({ from, to: index + 1 < starts.length ? starts[index + 1] - 1 : high }));
}

/**
 * Widths to measure in `intervals`: the narrowest end of each interval with every rule (`full`), the widest end with
 * the geometry rules only. `from` limits the plan to the widths at and above the phone layout or below it; `below`
 * keeps the intervals that start below a width (the finger is measured on phones and tablets); `only` keeps the
 * intervals that cross one of the ranges `[{ from, to }]` of a targeted pass. Returns `[{ width, full }]` in order.
 */
export function planWidths(intervals, { below = Number.POSITIVE_INFINITY, only = null } = {}) {
  const plan = new Map();
  for (const interval of intervals) {
    if (interval.from >= below) continue;
    if (only && !only.some((range) => range.from <= interval.to && range.to >= interval.from)) continue;
    plan.set(interval.from, true);
    if (interval.to !== interval.from && !plan.has(interval.to)) plan.set(interval.to, false);
  }
  return [...plan.entries()].map(([width, full]) => ({ width, full })).sort((a, b) => a.width - b.width);
}

/** Ranges written `761-1000,1001-1279` in an option, as `[{ from, to }]`. */
export function parseRanges(text) {
  if (!text) return null;
  return text.split(",").map((part) => {
    const [from, to] = part.split("-").map(Number);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) throw new Error(`Intervalle illisible : ${part}`);
    return { from, to };
  });
}

/** The interval of `intervals` that holds `width`, written « de 761 à 999 px ». */
export function intervalLabel(intervals, width) {
  const interval = intervals.find((entry) => width >= entry.from && width <= entry.to);
  return interval ? `de ${interval.from} à ${interval.to} px` : `${width} px`;
}

/** Lets the layout settle after a resize: two frames, then until the element count stops changing. */
export async function settleLayout(page) {
  await page.evaluate(async () => {
    const frame = () => new Promise((done) => requestAnimationFrame(() => done(undefined)));
    await frame();
    await frame();
    let previous = document.querySelectorAll("*").length;
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((done) => setTimeout(done, 60));
      const current = document.querySelectorAll("*").length;
      if (current === previous) break;
      previous = current;
    }
    const finite = document
      .getAnimations()
      .filter((animation) =>
        Number.isFinite(animation.effect?.getComputedTiming?.().endTime ?? Number.POSITIVE_INFINITY),
      );
    await Promise.race([
      Promise.all(finite.map((animation) => animation.finished.catch(() => undefined))),
      new Promise((done) => setTimeout(done, 1000)),
    ]);
    await document.fonts.ready;
  });
}

/**
 * Measures the current page by the sweep rules and returns its findings `{ rule, selector, detail }`.
 * Runs in the browser: it must not use anything outside its own body.
 */
export function measureLayout(options) {
  const { ignoreSelectors, touch, keyAttribute } = options;
  const findings = [];
  const width = window.innerWidth;
  const height = window.innerHeight;
  const ignored = (element) => ignoreSelectors.some((selector) => element.closest(selector));
  const interactiveSelector =
    "a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=checkbox], [role=radio], [role=switch], [role=menuitem], [role=option], [role=combobox]";

  const selectorOf = (element) => {
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

  const intersect = (a, b) => {
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);
    return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  };
  const clipCache = new Map();
  const clipOf = (element) => {
    if (!element || element === document.documentElement) return { left: -1e6, top: -1e6, right: 1e6, bottom: 1e6 };
    if (clipCache.has(element)) return clipCache.get(element);
    const parent = clipOf(element.parentElement);
    const style = getComputedStyle(element);
    const clip =
      style.overflowX !== "visible" || style.overflowY !== "visible"
        ? intersect(parent, element.getBoundingClientRect())
        : style.position === "fixed"
          ? { left: -1e6, top: -1e6, right: 1e6, bottom: 1e6 }
          : parent;
    clipCache.set(element, clip);
    return clip;
  };
  const shown = (element) => {
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || Number.parseFloat(style.opacity) === 0) return false;
    if (element.closest("[aria-hidden=true], [inert], [hidden]")) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 1 && rect.height <= 1) return false;
    if (/^inset\(50%/.test(style.clipPath) || (style.position === "absolute" && style.clip.startsWith("rect(0")))
      return false;
    const closed = element.parentElement?.closest("details:not([open])");
    if (closed && !element.closest("summary")) return false;
    return element.getClientRects().length > 0;
  };
  const declaredScroller = (element) => Boolean(element.closest("[data-horizontal-scroll]"));

  const texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    const parent = node.parentElement;
    if (!text || !parent || ignored(parent) || !shown(parent)) continue;
    if (["SCRIPT", "STYLE", "NOSCRIPT", "OPTION", "TITLE"].includes(parent.tagName)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (rect.height === 0 && rect.width === 0 && parent.getBoundingClientRect().width > 0) continue;
    const visible = intersect(clipOf(parent), rect);
    texts.push({ node, parent, text, rect, visible });
  }
  const commands = [...document.querySelectorAll(interactiveSelector)]
    .filter((element) => !ignored(element) && shown(element))
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return { element, rect, visible: intersect(clipOf(element), rect) };
    })
    .filter((entry) => entry.visible.width > 0 && entry.visible.height > 0);

  for (const entry of texts) {
    if (entry.text.length < 3) continue;
    if (entry.parent.closest(".list-row-detail, .list-row-fact")) continue;
    const style = getComputedStyle(entry.parent);
    const font = Number.parseFloat(style.fontSize) || 14;
    const container = entry.parent.closest(
      "h1, h2, h3, h4, [class*=title], [class*=name], [class*=label], button, a, th, td, li, dt, dd",
    );
    if (!container) continue;
    const whole = entry.parent.closest("[title]")?.getAttribute("title") ?? "";
    if (style.textOverflow === "ellipsis" && whole.includes(entry.text.trim())) continue;
    const shownWidth = entry.visible.width;
    const clipped = shownWidth + 1 < entry.rect.width;
    if (entry.parent.getBoundingClientRect().width < 1 || (clipped && shownWidth < font * 1.6)) {
      findings.push({
        rule: "hidden-name",
        selector: selectorOf(entry.parent),
        detail: `« ${entry.text.slice(0, 40)} » visible sur ${Math.round(shownWidth)} px`,
      });
    }
  }

  const floating = (element) => {
    for (let current = element; current && current !== document.body; current = current.parentElement)
      if (["fixed", "sticky"].includes(getComputedStyle(current).position)) return true;
    return false;
  };
  const boxes = [
    ...texts
      .filter((entry) => entry.visible.width > 0 && entry.visible.height > 0)
      .map((entry) => ({
        owner: entry.parent,
        rect: entry.visible,
        label: entry.text,
        floating: floating(entry.parent),
      })),
    ...commands
      .filter((entry) => !["INPUT", "TEXTAREA", "SELECT"].includes(entry.element.tagName))
      .map((entry) => ({
        owner: entry.element,
        rect: entry.visible,
        label: entry.element.textContent?.trim() || "",
        floating: floating(entry.element),
      })),
  ];
  const reported = new Set();
  boxes.sort((first, second) => first.rect.top - second.rect.top);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length && boxes[j].rect.top < boxes[i].rect.bottom; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.owner === b.owner || a.owner.contains(b.owner) || b.owner.contains(a.owner)) continue;
      if (a.floating !== b.floating) continue;
      const field = a.owner.closest("[data-slot=field]");
      if (field && field === b.owner.closest("[data-slot=field]")) continue;
      const crossing = intersect(a.rect, b.rect);
      if (crossing.width < 3 || crossing.height < 3) continue;
      const pair = `${selectorOf(a.owner)} | ${selectorOf(b.owner)}`;
      if (reported.has(pair)) continue;
      reported.add(pair);
      findings.push({
        rule: "overlap",
        selector: pair,
        detail: `« ${a.label.slice(0, 30)} » et « ${b.label.slice(0, 30)} »`,
      });
    }
  }

  const overflowing = (area, right, hidden = false) => {
    let culprit = null;
    let widest = right + 1;
    for (const element of area.querySelectorAll("*")) {
      if (!hidden && (ignored(element) || !shown(element))) continue;
      const edge = element.getBoundingClientRect().right;
      if (edge > widest + 0.5 || (culprit && edge >= widest - 0.5 && culprit.contains(element))) {
        widest = Math.max(widest, edge);
        culprit = element;
      }
    }
    if (culprit) return { selector: selectorOf(culprit), right: Math.round(widest) };
    if (!hidden) {
      const unseen = overflowing(area, right, true);
      if (unseen) return { ...unseen, selector: `${unseen.selector} (non dessiné)` };
    }
    return null;
  };
  const scrolling = document.scrollingElement ?? document.documentElement;
  if (scrolling.scrollWidth > width + 1) {
    const culprit = overflowing(document.body, width);
    findings.push({
      rule: "horizontal-scroll",
      selector: `document${culprit ? ` › déborde : ${culprit.selector}` : ""}`,
      detail: `${scrolling.scrollWidth} px pour ${width} px${culprit ? `, ${culprit.selector} va jusqu'à ${culprit.right} px` : ""}`,
    });
  }
  for (const element of document.querySelectorAll("body *")) {
    if (ignored(element) || declaredScroller(element)) continue;
    const style = getComputedStyle(element);
    if (!["auto", "scroll"].includes(style.overflowX)) continue;
    if (element.scrollWidth <= element.clientWidth + 1 || !shown(element)) continue;
    const box = element.getBoundingClientRect();
    const culprit = overflowing(element, box.left + element.clientWidth);
    findings.push({
      rule: "horizontal-scroll",
      selector: `${selectorOf(element)}${culprit ? ` › déborde : ${culprit.selector}` : ""}`,
      detail: `${element.scrollWidth} px pour ${element.clientWidth} px${culprit ? `, ${culprit.selector} va jusqu'à ${culprit.right - Math.round(box.left)} px dans la zone` : ""}`,
    });
  }

  for (const container of document.querySelectorAll("body *")) {
    if (ignored(container) || container.closest("[data-layout-flow]")) continue;
    const style = getComputedStyle(container);
    const isFlexRow = style.display.endsWith("flex") && style.flexDirection === "row" && style.flexWrap !== "nowrap";
    const isTableRow = container.tagName === "TR";
    if (!isFlexRow && !isTableRow) continue;
    if (!shown(container)) continue;
    const items = [...container.children].filter((child) => {
      if (!shown(child)) return false;
      const childStyle = getComputedStyle(child);
      if (childStyle.position === "absolute" || childStyle.position === "fixed") return false;
      const rect = child.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    if (items.length < 2) continue;
    const box = container.getBoundingClientRect();
    const lines = [];
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      const line = lines.find((entry) => rect.top < entry.bottom - 2 && rect.bottom > entry.top + 2);
      if (line) {
        line.items.push({ item, rect });
        line.top = Math.min(line.top, rect.top);
        line.bottom = Math.max(line.bottom, rect.bottom);
      } else lines.push({ top: rect.top, bottom: rect.bottom, items: [{ item, rect }] });
    }
    if (lines.length < 2) continue;
    for (const line of lines) {
      if (line.items.length !== 1) continue;
      const [{ item, rect }] = line.items;
      if (rect.width >= box.width * 0.6) continue;
      const pill = item.matches(".list-row-status, .record-state, [data-tone]")
        ? item
        : item.querySelector(":scope > :is(.list-row-status, .record-state, [data-tone])");
      if (width <= 760 && pill && line === lines.at(-1)) continue;
      findings.push({
        rule: "lone-wrap",
        selector: `${selectorOf(container)} › ${selectorOf(item).split(" › ").at(-1)}`,
        detail: `${lines.length} lignes, élément seul de ${Math.round(rect.width)} px sur ${Math.round(box.width)} px`,
      });
      break;
    }
  }

  const outside = (rect) => rect.left < -1 || rect.right > width + 1;
  for (const entry of [
    ...texts.map((text) => ({ owner: text.parent, visible: text.visible })),
    ...commands.map((command) => ({ owner: command.element, visible: command.visible })),
  ]) {
    if (
      entry.visible.width <= 0 ||
      entry.visible.height <= 0 ||
      entry.visible.bottom < 0 ||
      entry.visible.top > height * 20
    )
      continue;
    if (!outside(entry.visible) || declaredScroller(entry.owner)) continue;
    if (getComputedStyle(entry.owner).position === "fixed" && entry.visible.right <= 0) continue;
    findings.push({
      rule: "off-screen",
      selector: selectorOf(entry.owner),
      detail: `de ${Math.round(entry.visible.left)} à ${Math.round(entry.visible.right)} px sur ${width} px`,
    });
  }

  const header = document.querySelector("[data-testid=screen-header], [data-testid=phone-header]");
  if (header && shown(header)) {
    const band = header.getBoundingClientRect();
    for (const entry of [
      ...texts.map((text) => ({ owner: text.parent, visible: text.visible })),
      ...commands.map((command) => ({ owner: command.element, visible: command.visible })),
    ]) {
      if (header.contains(entry.owner) || entry.owner.contains(header)) continue;
      if (getComputedStyle(entry.owner).position === "fixed") continue;
      const { visible } = entry;
      if (visible.width <= 0 || visible.height <= 0) continue;
      if (
        visible.top < band.bottom - 1 &&
        visible.bottom > band.top + 1 &&
        visible.right > band.left &&
        visible.left < band.right
      ) {
        findings.push({
          rule: "under-header",
          selector: selectorOf(entry.owner),
          detail: `de ${Math.round(visible.top)} à ${Math.round(visible.bottom)} px sous un bandeau qui finit à ${Math.round(band.bottom)} px`,
        });
      }
    }
  }

  if (touch) {
    for (const { element, rect } of commands) {
      if (element.tagName === "A" && getComputedStyle(element).display.startsWith("inline")) {
        const block = element.parentElement?.closest("p, li, td, dd, blockquote");
        if (block && (block.textContent ?? "").trim().length > (element.textContent ?? "").trim().length + 1) continue;
      }
      const label = element.matches("input[type=checkbox], input[type=radio]") ? element.closest("label") : null;
      const target = label ? label.getBoundingClientRect() : rect;
      if (Math.min(target.width, target.height) >= 43.5) continue;
      findings.push({
        rule: "touch-target",
        selector: selectorOf(element),
        detail: `${Math.round(target.width)} × ${Math.round(target.height)} px`,
      });
    }
  }

  const unique = new Map();
  for (const finding of findings) unique.set(`${finding.rule}|${finding.selector}`, finding);
  return [...unique.values()];
}

/**
 * Groups raw findings `{ screen, width, input, menu, pane, text, rule, selector, detail }` by screen, rule and selector,
 * with, for each one, the intervals and states where it appears.
 */
export function groupFindings(raw, intervals) {
  const groups = new Map();
  for (const finding of raw) {
    const key = `${finding.screen} | ${finding.rule} | ${finding.selector}`;
    const group = groups.get(key) ?? {
      key,
      screen: finding.screen,
      rule: finding.rule,
      selector: finding.selector,
      detail: finding.detail,
      cases: [],
    };
    const where = `${intervalLabel(intervals, finding.width)} (${finding.width} px), ${finding.input === "touch" ? "doigt" : "souris"}, menu ${finding.menu}, volet ${finding.pane}${finding.text === "long" ? ", textes longs" : ""}`;
    if (!group.cases.includes(where)) group.cases.push(where);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}
