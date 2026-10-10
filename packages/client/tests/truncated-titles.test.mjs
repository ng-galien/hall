import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { beforeAll, test } from "vitest";

let revealTruncatedTitle;
let startTruncatedTitles;
let document;

function element(markup, { scrollWidth, clientWidth }) {
  const container = document.createElement("div");
  container.innerHTML = markup;
  const node = container.firstElementChild;
  Object.defineProperty(node, "scrollWidth", { configurable: true, get: () => scrollWidth });
  Object.defineProperty(node, "clientWidth", { configurable: true, get: () => clientWidth });
  node.style.textOverflow = "ellipsis";
  document.body.append(container);
  return node;
}

beforeAll(async () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Element = dom.window.Element;
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  document = dom.window.document;
  ({ revealTruncatedTitle, startTruncatedTitles } = await import("../src/lib/truncatedTitles.ts"));
  startTruncatedTitles(document);
});

test("a truncated element shows its full text as title on hover", () => {
  const name = element("<span>Coupe de bois sur route communale</span>", { scrollWidth: 240, clientWidth: 120 });
  name.dispatchEvent(new document.defaultView.Event("pointerover", { bubbles: true }));
  assert.equal(name.getAttribute("title"), "Coupe de bois sur route communale");
});

test("an element that fits gets no title, and loses the title once it fits again", () => {
  const name = element("<span>Forêt</span>", { scrollWidth: 40, clientWidth: 120 });
  revealTruncatedTitle(name);
  assert.equal(name.hasAttribute("title"), false);
  Object.defineProperty(name, "scrollWidth", { configurable: true, get: () => 400 });
  revealTruncatedTitle(name);
  assert.equal(name.getAttribute("title"), "Forêt");
  Object.defineProperty(name, "scrollWidth", { configurable: true, get: () => 40 });
  revealTruncatedTitle(name);
  assert.equal(name.hasAttribute("title"), false);
});

test("an authored title is never replaced", () => {
  const name = element('<span title="Libellé">Texte long tronqué</span>', { scrollWidth: 400, clientWidth: 100 });
  revealTruncatedTitle(name);
  assert.equal(name.getAttribute("title"), "Libellé");
});

test("hovering an icon inside a truncated label reveals the label text", () => {
  const name = element(
    '<span><svg aria-hidden="true"><path d="M0 0"/></svg>Facturation électronique des coupes</span>',
    {
      scrollWidth: 300,
      clientWidth: 90,
    },
  );
  name.querySelector("path").dispatchEvent(new document.defaultView.Event("pointerover", { bubbles: true }));
  assert.equal(name.getAttribute("title"), "Facturation électronique des coupes");
});
