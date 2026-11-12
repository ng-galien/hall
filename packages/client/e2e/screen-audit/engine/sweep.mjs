/*
 * Width sweep of the screen audit: every screen is measured at close widths, in every state of its menu and panes,
 * by generic layout rules evaluated in the page. No screenshot is taken; a finding names the screen, the width, the
 * input, the states, the rule and a selector.
 */

/** Layout rules of the sweep, with their French title for the report. */
export const sweepRules = {
  "hidden-name": "Titre ou nom de largeur nulle ou coupé à moins de trois caractères",
  overlap: "Deux textes ou commandes qui se recouvrent",
  "horizontal-scroll": "Défilement horizontal du document ou d'une zone",
  "lone-wrap": "Élément rejeté seul sous les autres éléments de sa rangée",
  "off-screen": "Texte ou commande hors de l'écran",
  "touch-target": "Cible tactile de moins de 44 px au téléphone",
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
    // Transitions started by the resize (a bar or a pane sliding in) end before the measure.
    const finite = document
      .getAnimations()
      .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming?.().endTime ?? Number.POSITIVE_INFINITY));
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
  /** The part of the page an element can show: its ancestors that clip their overflow, intersected. */
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
    // A closed <details> shows its summary only.
    const closed = element.parentElement?.closest("details:not([open])");
    if (closed && !element.closest("summary")) return false;
    return element.getClientRects().length > 0;
  };
  /** Declared horizontal scrolling: a data table or a strip that scrolls sideways by design. */
  const declaredScroller = (element) => Boolean(element.closest("[data-horizontal-scroll]"));

  /* Text boxes: each non-empty text node, measured by its own range and clipped by its ancestors. */
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

  /* hidden-name: a title or a name whose box shows less than three characters. */
  for (const entry of texts) {
    if (entry.text.length < 3) continue;
    const style = getComputedStyle(entry.parent);
    const font = Number.parseFloat(style.fontSize) || 14;
    const container = entry.parent.closest(
      "h1, h2, h3, h4, [class*=title], [class*=name], [class*=label], button, a, th, td, li, dt, dd",
    );
    if (!container) continue;
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

  /* overlap: two text boxes, or a text box and a command, or two commands, unrelated in the tree, that cross. */
  const boxes = [
    ...texts
      .filter((entry) => entry.visible.width > 0 && entry.visible.height > 0)
      .map((entry) => ({ owner: entry.parent, rect: entry.visible, label: entry.text })),
    ...commands
      .filter((entry) => !["INPUT", "TEXTAREA", "SELECT"].includes(entry.element.tagName))
      .map((entry) => ({ owner: entry.element, rect: entry.visible, label: entry.element.textContent?.trim() || "" })),
  ];
  const reported = new Set();
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.owner === b.owner || a.owner.contains(b.owner) || b.owner.contains(a.owner)) continue;
      // A form field (choice 12D) writes its label inside the box of its control.
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

  /* horizontal-scroll: the document or any area wider than its box, except a declared data table or strip. */
  const scrolling = document.scrollingElement ?? document.documentElement;
  if (scrolling.scrollWidth > width + 1) {
    findings.push({ rule: "horizontal-scroll", selector: "document", detail: `${scrolling.scrollWidth} px` });
  }
  for (const element of document.querySelectorAll("body *")) {
    if (ignored(element) || declaredScroller(element)) continue;
    const style = getComputedStyle(element);
    if (!["auto", "scroll"].includes(style.overflowX)) continue;
    if (element.scrollWidth <= element.clientWidth + 1 || !shown(element)) continue;
    findings.push({
      rule: "horizontal-scroll",
      selector: selectorOf(element),
      detail: `${element.scrollWidth} px pour ${element.clientWidth} px`,
    });
  }

  /*
   * lone-wrap: in a row (a flex row or a table row), the items share one line or wrap by whole groups; one narrow item
   * alone on its line under or above the others is a broken row. A free-flow container (tags, chips) declares
   * `data-layout-flow`.
   */
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
      // A full-width item (a search field, the action row of a prominent row) is a whole group of its own.
      if (rect.width >= box.width * 0.6) continue;
      findings.push({
        rule: "lone-wrap",
        selector: `${selectorOf(container)} › ${selectorOf(item).split(" › ").at(-1)}`,
        detail: `${lines.length} lignes, élément seul de ${Math.round(rect.width)} px sur ${Math.round(box.width)} px`,
      });
      break;
    }
  }

  /* off-screen: a text or a command whose visible part goes past the left or right edge of the screen. */
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

  /* touch-target: under a finger at phone width, every command offers 44 px; a link inside a sentence is exempt. */
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
