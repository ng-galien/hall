import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><body></body>");
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.MutationObserver = dom.window.MutationObserver;

const { Editor } = await import("@tiptap/core");
const { editorExtensions } = await import("./src/components/editor/extensions.ts");

const editor = new Editor({
  element: document.createElement("div"),
  extensions: editorExtensions({}),
});

const richMd = `Avant.

<table>
  <tr><th colspan="2">Budget</th><th>Total</th></tr>
  <tr><td>Fonctionnement</td><td style="text-align: right">1 200 €</td><td rowspan="2">4 000 €</td></tr>
  <tr><td>Investissement</td><td style="text-align: right">2 800 €</td></tr>
</table>

Après.`;
editor.commands.setContent(richMd, { contentType: "markdown" });
const out = editor.getMarkdown();
console.log("=== table riche sérialisée ===");
console.log(out);

// re-parse du résultat : la boucle est-elle stable ?
editor.commands.setContent(out, { contentType: "markdown" });
const out2 = editor.getMarkdown();
console.log("=== stable ===", out === out2);

// une table simple reste bien en GFM ?
editor.commands.setContent("| A | B |\n| --- | ---: |\n| x | 1 |", { contentType: "markdown" });
console.log("=== table simple ===");
console.log(editor.getMarkdown());
