import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { collectSnapshot } from "./collect.mjs";

const maximumParts = 4;

/** Collection options of the engine; a project overrides any of them in its configuration. */
export const defaultCollectOptions = {
  keyAttribute: "data-testid",
  ignoreSelectors: [],
  interactiveSelector:
    "a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=checkbox], [role=radio], [role=switch], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=option], [role=combobox], [tabindex]:not([tabindex='-1'])",
  contentSelectors: [
    "p",
    "li",
    "table",
    "[role=grid]",
    "[role=row]",
    "article",
    "img",
    "canvas",
    "textarea",
    "dl",
    "[contenteditable=true]",
  ],
  chromeSelectors: [],
  activeSelector: "[aria-current=page], [aria-current=true], [aria-selected=true], [data-state=active]",
};

/** Waits for finite animations and fonts, so that the measured geometry is the settled one. */
export async function settle(page) {
  // The page is taken as rendered once its element count and text length stop changing for half a second.
  await page.evaluate(async () => {
    const signature = () => `${document.querySelectorAll("*").length}:${document.body.innerText.length}`;
    let previous = signature();
    for (let attempt = 0, stable = 0; attempt < 30 && stable < 2; attempt++) {
      await new Promise((done) => setTimeout(done, 250));
      const current = signature();
      stable = current === previous ? stable + 1 : 0;
      previous = current;
    }
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
}

/** Records the string values of the JSON answers matching `pattern`; texts equal to one of them come from data. */
export function recordDataStrings(page, pattern) {
  const strings = new Set();
  const walk = (value) => {
    if (typeof value === "string") {
      const text = value.replace(/\s+/g, " ").trim();
      if (text.length >= 2 && text.length <= 400) strings.add(text);
    } else if (Array.isArray(value)) for (const item of value) walk(item);
    else if (value && typeof value === "object") for (const item of Object.values(value)) walk(item);
  };
  page.on("response", async (response) => {
    if (!pattern.test(response.url())) return;
    if (!(response.headers()["content-type"] ?? "").includes("json")) return;
    try {
      walk(await response.json());
    } catch {
      // A body that is not available (redirect, aborted request) carries no text.
    }
  });
  return strings;
}

/**
 * Measures the current page as one screen at one format and writes `<screen>.json` with its screenshots
 * (`<screen>-0.png` … one per height of the scrolling area, at most four) under `<outputDirectory>/<format>/`.
 */
export async function captureScreen(page, { screen, format, outputDirectory, collect }) {
  const directory = join(outputDirectory, "raw", format.id);
  mkdirSync(directory, { recursive: true });
  await settle(page);
  const snapshot = await page.evaluate(collectSnapshot, collect);
  const parts = [];
  const scroller = snapshot.scroller;
  const scrollable = scroller
    ? Math.max(0, scroller.scrollHeight - scroller.height)
    : Math.max(0, snapshot.document.scrollHeight - snapshot.viewport.height);
  const step = scroller ? scroller.height : snapshot.viewport.height;
  for (let part = 0; part < maximumParts; part++) {
    const offset = Math.min(part * step, scrollable);
    if (part > 0 && offset <= parts[parts.length - 1].offset) break;
    await page.evaluate(
      ({ offset, index }) => {
        const target = index === null ? document.scrollingElement : window.__screenAuditScroller;
        if (target) target.scrollTop = offset;
      },
      { offset, index: scroller ? scroller.index : null },
    );
    if (part === 0 && scroller) {
      // The scrolling area is located again by its geometry: the snapshot index has no DOM handle.
      await page.evaluate(
        ({ top, height }) => {
          const candidates = [...document.querySelectorAll("body *")].filter((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return (
              ["auto", "scroll"].includes(style.overflowY) &&
              Math.abs(rect.top - top) < 1 &&
              Math.abs(element.clientHeight - height) < 1
            );
          });
          window.__screenAuditScroller = candidates.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] ?? null;
        },
        { top: scroller.top, height: scroller.height },
      );
    }
    await page.waitForTimeout(part === 0 ? 0 : 150);
    const file = `${screen.id}-${part}.png`;
    await page.screenshot({ path: join(directory, file), animations: "disabled" });
    parts.push({ file, offset });
  }
  await page.evaluate(() => {
    const target = window.__screenAuditScroller ?? document.scrollingElement;
    if (target) target.scrollTop = 0;
    window.__screenAuditScroller = undefined;
  });
  const record = {
    screen: { id: screen.id, title: screen.title, route: page.url().replace(/^https?:\/\/[^/]+/, "") },
    format: format.id,
    capturedAt: new Date().toISOString(),
    parts,
    ...snapshot,
  };
  writeFileSync(join(directory, `${screen.id}.json`), JSON.stringify(record));
  return record;
}

/** Records a screen that could not be opened, so that the report lists it instead of omitting it. */
export function recordMissingScreen({ screen, format, outputDirectory, error }) {
  const directory = join(outputDirectory, "raw", format.id);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, `${screen.id}.missing.json`),
    JSON.stringify({ screen: { id: screen.id, title: screen.title }, format: format.id, error: String(error) }),
  );
}

/** Writes the data strings seen during one browser session; the text classification uses their union. */
export function writeDataStrings({ outputDirectory, format, name, strings }) {
  const directory = join(outputDirectory, "raw", format.id);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `data-strings.${name}.json`), JSON.stringify([...strings]));
}
