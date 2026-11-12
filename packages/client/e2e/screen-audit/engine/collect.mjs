/**
 * In-page geometry snapshot. This function is passed to `page.evaluate` and must stay self-contained: it reads the
 * rendered document and returns plain data, every rule is then evaluated in Node on that data. Hidden overflow cuts
 * its content, while a scrolling axis keeps it reachable; an open modal dialog makes the rest of the page inert, so
 * only the dialog is measured.
 *
 * @param {{
 *   keyAttribute: string,
 *   ignoreSelectors: string[],
 *   interactiveSelector: string,
 *   contentSelectors: string[],
 *   chromeSelectors: string[],
 *   activeSelector: string,
 * }} options
 */
export function collectSnapshot(options) {
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight;
  const ignore = options.ignoreSelectors.join(", ");
  const chrome = options.chromeSelectors.join(", ");
  const content = options.contentSelectors.join(", ");
  const normalize = (value) =>
    value
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "*")
      .replace(/\d+/g, "#")
      .trim();
  const keyCache = new Map();
  const keyOf = (element) => {
    if (keyCache.has(element)) return keyCache.get(element);
    let key;
    const own = element.getAttribute(options.keyAttribute);
    if (own) key = `[${normalize(own)}]`;
    else {
      const parts = [];
      let current = element;
      for (let depth = 0; current && current !== document.body && depth < 5; depth++) {
        const attribute = current.getAttribute(options.keyAttribute);
        if (attribute && current !== element) {
          parts.unshift(`[${normalize(attribute)}]`);
          break;
        }
        const tag = current.tagName.toLowerCase();
        const parent = current.parentElement;
        const same = parent ? [...parent.children].filter((child) => child.tagName === current.tagName) : [];
        parts.unshift(same.length > 1 ? `${tag}:${same.indexOf(current) + 1}` : tag);
        current = parent;
      }
      key = parts.join(" › ");
    }
    keyCache.set(element, key);
    return key;
  };
  const iconHash = (svg) => {
    const source = [...svg.querySelectorAll("path, circle, rect, line, polyline, polygon")]
      .map((shape) => shape.getAttribute("d") ?? shape.outerHTML)
      .join("|");
    let hash = 0;
    for (let index = 0; index < source.length; index++) hash = (hash * 31 + source.charCodeAt(index)) | 0;
    return (hash >>> 0).toString(36);
  };
  const ownText = (element) =>
    [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  const textRect = (element) => {
    const range = document.createRange();
    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    let lines = 0;
    for (const node of element.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE || !(node.textContent ?? "").trim()) continue;
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width <= 0 || rect.height <= 0) continue;
        lines++;
        left = Math.min(left, rect.left);
        top = Math.min(top, rect.top);
        right = Math.max(right, rect.right);
        bottom = Math.max(bottom, rect.bottom);
      }
    }
    return lines ? { x: left, y: top, w: right - left, h: bottom - top, lines } : null;
  };
  const round = (value) => Math.round(value * 10) / 10;
  const box = (rect) => ({
    x: round(rect.x),
    y: round(rect.y),
    w: round(rect.width ?? rect.w),
    h: round(rect.height ?? rect.h),
  });
  const intersect = (a, b) => {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.w, b.x + b.w);
    const bottom = Math.min(a.y + a.h, b.y + b.h);
    return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
  };
  const inSentence = (element) => {
    if (element.tagName !== "A" || !getComputedStyle(element).display.startsWith("inline")) return false;
    const block = element.parentElement?.closest("p, li, td, dd, blockquote");
    return Boolean(block && (block.textContent ?? "").trim().length > (element.textContent ?? "").trim().length + 1);
  };

  const scrolling = document.scrollingElement ?? document.documentElement;
  const documentScrollsY = scrolling.scrollHeight > scrolling.clientHeight + 1;
  const documentScrollsX = scrolling.scrollWidth > viewportWidth + 1;
  const elements = [];
  const indexOf = new Map();
  const page = { x: -1e6, y: -1e6, w: 2e6, h: 2e6 };

  /** Visible text of a command, without its icons: an icon beside a label is not the only mark of its action. */
  const commandLabel = (element) => {
    let text = "";
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest("svg")) continue;
      const parentStyle = getComputedStyle(parent);
      if (
        parentStyle.visibility === "hidden" ||
        parentStyle.display === "none" ||
        /^inset\(50%/.test(parentStyle.clipPath)
      )
        continue;
      if (parentStyle.position === "absolute" && parentStyle.clip.startsWith("rect(0")) continue;
      text += node.textContent ?? "";
    }
    return text.replace(/\s+/g, " ").trim();
  };
  const interactiveOwner = (element) => element.parentElement?.closest(options.interactiveSelector) ?? null;
  const visit = (element, parentIndex, clip, clipOwner, interactiveAncestor) => {
    if (ignore && element.matches(ignore)) return;
    const style = getComputedStyle(element);
    if (style.display === "none") return;
    const rect = element.getBoundingClientRect();
    const hidden = style.visibility === "hidden" || Number.parseFloat(style.opacity) === 0;
    const screenReaderOnly =
      (rect.width <= 1 && rect.height <= 1) ||
      (style.position === "absolute" && style.clip.startsWith("rect(0")) ||
      /^inset\(50%/.test(style.clipPath);
    const geometry = box(rect);
    const visibleBox = intersect(geometry, clip);
    const tag = element.tagName.toLowerCase();
    const isSvg = tag === "svg";
    let index = parentIndex;
    const visible =
      !hidden && !screenReaderOnly && geometry.w > 0 && geometry.h > 0 && visibleBox.w > 0 && visibleBox.h > 0;
    const parentPointer = element.parentElement ? getComputedStyle(element.parentElement).cursor === "pointer" : false;
    const matchesInteractive = element.matches(options.interactiveSelector);
    const pointerRoot = style.cursor === "pointer" && !parentPointer && !interactiveAncestor;
    const interactive = matchesInteractive || pointerRoot;
    if (visible) {
      const text = isSvg ? "" : ownText(element);
      const typed = element;
      const checkable = tag === "input" && (typed.type === "checkbox" || typed.type === "radio");
      const label = checkable ? element.closest("label") : null;
      const touch = label ? box(label.getBoundingClientRect()) : geometry;
      const scrollableY =
        ["auto", "scroll"].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
      const scrollableX = ["auto", "scroll"].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 1;
      const clippedBy =
        clipOwner >= 0 &&
        (geometry.x < clip.x - 2 ||
          geometry.y < clip.y - 2 ||
          geometry.x + geometry.w > clip.x + clip.w + 2 ||
          geometry.y + geometry.h > clip.y + clip.h + 2)
          ? clipOwner
          : -1;
      const svgs = isSvg ? [] : [...element.querySelectorAll(":scope svg")];
      const iconSvg = !isSvg && interactive && svgs.length === 1 ? svgs[0] : null;
      const iconBox = iconSvg ? box(iconSvg.getBoundingClientRect()) : null;
      const textContent = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      const entry = {
        parent: parentIndex,
        key: keyOf(element),
        tag,
        role: element.getAttribute("role") ?? "",
        rect: geometry,
        visibleRect: box(visibleBox),
        touchRect: touch,
        interactive,
        inSentence: interactive && inSentence(element),
        insideInteractive: interactiveAncestor,
        text: text.slice(0, 300),
        textRect: text ? textRect(element) : null,
        /* The text as shown: its box cut by the ancestors that clip it (an ellipsis hides the rest). */
        visibleTextRect: text && textRect(element) ? box(intersect(textRect(element), clip)) : null,
        /* For an icon: the command that holds it shows a label of its own. */
        commandLabelled:
          isSvg && interactiveAncestor ? Boolean(commandLabel(interactiveOwner(element) ?? element)) : false,
        /* A search field and a form field are two components. */
        fieldKind:
          tag === "input" || tag === "textarea"
            ? element.closest("[data-slot=search-input], [role=search]") || element.getAttribute("type") === "search"
              ? "recherche"
              : element.closest("[data-slot=field]")
                ? "champ"
                : "saisie libre"
            : "",
        textContent: interactive || /^h[1-6]$/.test(tag) ? textContent.slice(0, 120) : "",
        placeholder: element.getAttribute("placeholder") ?? "",
        ariaLabel: element.getAttribute("aria-label") ?? "",
        fontSize: Number.parseFloat(style.fontSize),
        fontWeight: Number.parseInt(style.fontWeight, 10) || 400,
        lineHeight: Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2,
        color: style.color,
        background: style.backgroundColor,
        painted:
          !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(style.backgroundColor) ||
          (Number.parseFloat(style.borderTopWidth) > 0 &&
            style.borderTopStyle !== "none" &&
            !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(style.borderTopColor)) ||
          style.boxShadow !== "none",
        display: style.display,
        position: style.position,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
        lineClamp: style.webkitLineClamp && style.webkitLineClamp !== "none" ? style.webkitLineClamp : "",
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        scrollableX,
        scrollableY,
        clippedBy,
        chrome: Boolean(chrome && element.closest(chrome)),
        inHeader: Boolean(element.closest("header, nav, [role=toolbar], [role=tablist], [role=menubar], thead")),
        content: Boolean(content && element.matches(content)),
        active: Boolean(options.activeSelector && element.matches(options.activeSelector)),
        slot: element.getAttribute("data-slot") ?? "",
        variant: element.getAttribute("data-variant") ?? "",
        size: element.getAttribute("data-size") ?? "",
        isSvg,
        iconHash: isSvg ? iconHash(element) : iconSvg ? iconHash(iconSvg) : "",
        iconRect: isSvg ? geometry : iconBox,
        iconOnly: Boolean(iconSvg) && !textContent,
        hasBlockChildren: [...element.children].some((child) => !getComputedStyle(child).display.startsWith("inline")),
        inlineChildren: element.children.length,
      };
      index = elements.length;
      elements.push(entry);
      indexOf.set(element, index);
    }
    if (isSvg) return;
    let nextClip = clip;
    let nextOwner = clipOwner;
    const cutsX = ["hidden", "clip"].includes(style.overflowX);
    const cutsY = ["hidden", "clip"].includes(style.overflowY);
    const scrolls = ["auto", "scroll"].includes(style.overflowX) || ["auto", "scroll"].includes(style.overflowY);
    if (cutsX || cutsY) {
      nextClip = intersect(clip, {
        x: cutsX ? geometry.x : page.x,
        y: cutsY ? geometry.y : page.y,
        w: cutsX ? geometry.w : page.w,
        h: cutsY ? geometry.h : page.h,
      });
      nextOwner = visible && index >= 0 && !scrolls ? index : clipOwner;
    } else if (scrolls) {
      nextClip = page;
      nextOwner = -1;
    }
    // A closed <details> shows its summary only.
    const shownChildren =
      tag === "details" && !element.open
        ? [...element.children].filter((child) => child.tagName === "SUMMARY")
        : element.children;
    for (const child of shownChildren)
      visit(child, index, nextClip, nextOwner, interactiveAncestor || (visible && interactive));
  };
  const modals = [
    ...document.querySelectorAll('[aria-modal="true"], dialog[open], [role="dialog"], [role="alertdialog"]'),
  ].filter((element) => element.getClientRects().length > 0);
  const roots = modals.length ? modals : [...document.body.children];
  for (const root of roots) visit(root, -1, page, -1, false);

  const scrollers = elements
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.scrollableY && entry.rect.h > viewportHeight * 0.3)
    .sort((a, b) => b.entry.rect.w * b.entry.rect.h - a.entry.rect.w * a.entry.rect.h);
  const main = documentScrollsY ? null : (scrollers[0] ?? null);
  return {
    viewport: { width: viewportWidth, height: viewportHeight },
    document: {
      scrollWidth: scrolling.scrollWidth,
      scrollHeight: scrolling.scrollHeight,
      scrollsX: documentScrollsX,
      scrollsY: documentScrollsY,
    },
    scroller: main
      ? {
          index: main.index,
          top: main.entry.rect.y,
          height: main.entry.clientHeight,
          scrollHeight: main.entry.scrollHeight,
        }
      : null,
    elements,
  };
}
