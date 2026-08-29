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

const md = "Rapporteur : :member[Jeanne Dupont]{#abc-123}, pièce :resource[Budget 2026]{#doc-9}.\n\nDirective inconnue :snippet[x]{#y} préservée ?";
editor.commands.setContent(md, { contentType: "markdown" });
const json = editor.getJSON();
const inline = json.content[0].content.map((n) => n.type + (n.attrs ? `(${n.attrs.kind ?? ""})` : ""));
console.log("types:", inline.join(","));
console.log("out:\n" + editor.getMarkdown());
