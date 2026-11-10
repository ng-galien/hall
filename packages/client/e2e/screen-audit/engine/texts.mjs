/**
 * Extracts the visible texts of every screen and format, with their kind and their origin: the project's message
 * catalogue ("fixed"), the application data ("data"), or neither ("unclassified", most often a fixed text written
 * outside the catalogue or a text composed from several sources). Relevance is not judged here.
 */

const normalize = (text) => text.replace(/\s+/g, " ").trim();
const dataPattern =
  /^[\d\s.,:/%€h°+-]+$|^\d{1,2}(er)? [a-zéû]+\.? \d{4}|^(lun|mar|mer|jeu|ven|sam|dim)[a-z]*\.? \d|^\d{1,2}:\d{2}$/i;

export function textCatalog(messages) {
  const exact = new Set();
  const segments = new Set();
  const templates = [];
  for (const message of messages) {
    const text = normalize(message);
    if (!text) continue;
    if (!/\{\w+\}/.test(text)) {
      exact.add(text);
      continue;
    }
    const pattern = text
      .split(/\{\w+\}/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".+?");
    templates.push(new RegExp(`^${pattern}$`));
    for (const segment of text.split(/\{\w+\}/)) {
      const piece = segment.replace(/^[\s(:·,–-]+|[\s):·,–-]+$/g, "");
      if (piece.length >= 3) segments.add(piece);
    }
  }
  return { exact, segments, templates };
}

function origin(text, catalog, data, longData) {
  if (catalog.exact.has(text) || catalog.exact.has(text.replace(/\s*:$/, ""))) return "fixed";
  if (data.has(text)) return "data";
  if (catalog.templates.some((template) => template.test(text))) return "fixed";
  if (catalog.segments.has(text)) return "fixed";
  if (dataPattern.test(text)) return "data";
  if (text.length >= 8 && longData.some((value) => text.includes(value))) return "data";
  return "unclassified";
}

function kindOf(record, index) {
  const entry = record.elements[index];
  const keys = [];
  let heading = /^h[1-6]$/.test(entry.tag) || entry.role === "heading";
  let label = ["label", "legend", "th", "dt", "caption"].includes(entry.tag) || entry.role === "columnheader";
  let action = entry.interactive || entry.insideInteractive;
  for (let current = index; current >= 0; current = record.elements[current].parent) {
    const ancestor = record.elements[current];
    keys.push(ancestor.key);
    if (/^h[1-6]$/.test(ancestor.tag)) heading = true;
    if (["label", "legend", "th", "dt"].includes(ancestor.tag)) label = true;
    if (ancestor.interactive) action = true;
  }
  const joined = keys.join(" ").toLowerCase();
  if (heading) return "heading";
  if (/empty/.test(joined)) return "empty-state";
  if (label) return "label";
  if (action) return "action";
  if (/hint|help|description|caption|explanation/.test(joined)) return "help";
  return "text";
}

export function extractTexts(records, { messages, dataStrings }) {
  const catalog = textCatalog(messages);
  const data = new Set(dataStrings);
  const longData = [...data].filter((value) => value.length >= 8);
  const screens = [];
  for (const record of records) {
    const seen = new Set();
    const texts = [];
    const add = (text, kind, element) => {
      const value = normalize(text);
      if (!value || seen.has(`${kind}|${value}`)) return;
      seen.add(`${kind}|${value}`);
      texts.push({ text: value, kind, origin: origin(value, catalog, data, longData), element });
    };
    record.elements.forEach((entry, index) => {
      if (entry.text) add(entry.text, kindOf(record, index), entry.key);
      if (entry.placeholder) add(entry.placeholder, "placeholder", entry.key);
    });
    screens.push({ screen: record.screen.id, title: record.screen.title, format: record.format, texts });
  }
  return screens;
}
