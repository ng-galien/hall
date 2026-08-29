import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><body></body>");
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.MutationObserver = dom.window.MutationObserver;
global.ClipboardEvent = dom.window.Event;
global.DragEvent = dom.window.Event;

const { Editor } = await import("@tiptap/core");
const StarterKit = (await import("@tiptap/starter-kit")).default;
const { Markdown } = await import("@tiptap/markdown");
const { TableKit } = await import("@tiptap/extension-table");

const editor = new Editor({
  element: document.createElement("div"),
  extensions: [StarterKit, Markdown, TableKit.configure({ table: { resizable: true } })],
});

// a) Markdown -> table HTML embarquée relue ?
const md = `Avant.

<table>
  <tr><th colspan="2">Budget</th><th>Total</th></tr>
  <tr><td>Fonctionnement</td><td style="text-align: right">1 200 €</td><td rowspan="2">4 000 €</td></tr>
  <tr><td>Investissement</td><td style="text-align: right">2 800 €</td></tr>
</table>

Après.`;
editor.commands.setContent(md, { contentType: "markdown" });
const json = editor.getJSON();
console.log("a) types:", json.content.map((n) => n.type).join(","));
const table = json.content.find((n) => n.type === "table");
if (table) {
  const firstCell = table.content[0].content[0];
  console.log("a) first cell:", firstCell.type, JSON.stringify(firstCell.attrs));
  const spanCell = table.content[1].content[2];
  console.log("a) rowspan cell:", spanCell ? JSON.stringify(spanCell.attrs) : "absent");
}

// b) que produit getMarkdown sur cette table fusionnée ?
console.log("b) serialized:\n" + editor.getMarkdown());
