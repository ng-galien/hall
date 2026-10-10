const OWNED_TITLE_ATTRIBUTE = "data-truncated-title";
const ANCESTOR_SEARCH_DEPTH = 4;

function isTruncated(element: HTMLElement): boolean {
  return element.scrollWidth > element.clientWidth;
}

function nearestHtmlElement(target: EventTarget | null): HTMLElement | null {
  let node = target instanceof Element ? target : null;
  while (node && !(node instanceof HTMLElement)) node = node.parentElement;
  return node;
}

function ellipsisElement(target: EventTarget | null): HTMLElement | null {
  let element = nearestHtmlElement(target);
  for (let depth = 0; element && depth < ANCESTOR_SEARCH_DEPTH; depth += 1) {
    if (getComputedStyle(element).textOverflow === "ellipsis") return element;
    element = element.parentElement;
  }
  return null;
}

/** Sets the full text as native title while an ellipsis element is truncated; an authored title is kept. */
export function revealTruncatedTitle(element: HTMLElement): void {
  const owned = element.hasAttribute(OWNED_TITLE_ATTRIBUTE);
  if (!owned && element.hasAttribute("title")) return;
  const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (text && isTruncated(element)) {
    element.setAttribute("title", text);
    element.setAttribute(OWNED_TITLE_ATTRIBUTE, "");
  } else if (owned) {
    element.removeAttribute("title");
    element.removeAttribute(OWNED_TITLE_ATTRIBUTE);
  }
}

let started = false;

// @implements-requirement HALL-FR-WSP-300

/** Reveals the full text of every ellipsis-truncated element on hover, across the whole client. */
export function startTruncatedTitles(root: Document = document): void {
  if (started) return;
  started = true;
  root.addEventListener(
    "pointerover",
    (event) => {
      const element = ellipsisElement(event.target);
      if (element) revealTruncatedTitle(element);
    },
    { passive: true },
  );
}
