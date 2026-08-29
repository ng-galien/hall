import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const sourceRoot = join(import.meta.dirname, "..", "src");
const tokens = readFileSync(join(sourceRoot, "styles", "tokens.css"), "utf8");
const styleFiles = [
  "styles.css",
  "styles/base.css",
  "styles/components.css",
  "styles/live.css",
  "styles/meeting-workspace.css",
  "styles/workspace.css",
];
const styles = styleFiles.map((path) => readFileSync(join(sourceRoot, path), "utf8")).join("\n");

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(css|ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const allFiles = sourceFiles(sourceRoot);
const applicationSource = allFiles.map((path) => readFileSync(path, "utf8")).join("\n");
/* Les composants de components/ui viennent de shadcn : on les possède mais on ne les a pas écrits,
   et ils s'autorisent des utilitaires Tailwind bruts. Les règles de discipline ne visent que notre code. */
const authoredSource = allFiles
  .filter((path) => !path.includes(`${"components"}/ui/`))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

test("visual values have one CSS token source", () => {
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b|rgba?\(|oklch\(/i);
});

test("every CSS variable used by the styles or the components resolves", () => {
  const declarations = new Set([...`${tokens}\n${styles}`.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
  const references = [...applicationSource.matchAll(/var\((--[\w-]+)[,)]/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(references.filter((reference) => !declarations.has(reference)))], []);
});

test("Tailwind bridges to the Hall token namespace", () => {
  const themeBlock = styles.match(/@theme inline \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.ok(themeBlock.length > 0);
  assert.match(styles, /--font-weight-semibold: var\(--hall-font-weight-semibold\)/);
  assert.doesNotMatch(authoredSource, /\bduration-\d+\b|tracking-\[[^\]]+\]/);
  assert.doesNotMatch(authoredSource, /\banimate-pulse\b|\bease-out\b/);
});

test("shadcn variables are aliases of Hall tokens, never literal values", () => {
  // Les composants copiés dans components/ui sont stylés par ces variables : si l'une d'elles
  // portait une valeur littérale, l'identité de l'application cesserait d'être pilotée par tokens.css.
  const bridge = styles.match(/:root \{\n(\s*--background:[\s\S]*?)\n\}/)?.[1];
  assert.ok(bridge, "le pont shadcn → tokens Hall est introuvable dans styles.css");
  for (const declaration of bridge.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    assert.match(declaration[2], /^var\(--hall-/, `${declaration[1]} doit être un alias d'un token Hall`);
  }
  for (const required of ["--primary", "--background", "--foreground", "--border", "--ring"]) {
    assert.match(bridge, new RegExp(`\\${required}:`), `${required} manque au pont shadcn`);
  }
});

test("the abandoned component libraries leave no trace", () => {
  assert.doesNotMatch(applicationSource, /@fluentui\//, "Fluent UI ne doit plus être importé");
  assert.doesNotMatch(applicationSource, /from "lucide-react"/, "les icônes viennent du module Phosphor maison");
});
