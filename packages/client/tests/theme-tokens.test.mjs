import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";

const sourceRoot = join(import.meta.dirname, "..", "src");
const tokens = readFileSync(join(sourceRoot, "styles", "tokens.css"), "utf8");
const styleFiles = [
  "styles.css",
  "styles/base.css",
  "styles/components.css",
  "styles/editor.css",
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
/* Shadcn components are vendored and may use raw Tailwind utilities. Project rules target authored code. */
const authoredSource = allFiles
  .filter((path) => !path.includes(`${"components"}/ui/`))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

test("visual values have one CSS token source", () => {
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b|rgba?\(|oklch\(/i);
});

test("measurements come from the token scale, never from a literal", () => {
  const measurement = /(?<![\w-])-?\d+(?:\.\d+)?(?:px|rem|em|ch)\b/g;
  const offenders = [];
  for (const path of styleFiles) {
    const source = readFileSync(join(sourceRoot, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, (comment) =>
      comment.replace(/[^\n]/g, " "),
    );
    for (const [index, line] of source.split("\n").entries()) {
      if (/@(?:media|container)\s*\(/.test(line)) continue;
      for (const match of line.matchAll(measurement)) offenders.push(`${path}:${index + 1} ${match[0]}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("breakpoints follow the three-step ladder", () => {
  const ladder = new Set(["760px", "1000px", "1280px"]);
  const used = [...styles.matchAll(/@(?:media|container)\s*\((?:min|max)-width:\s*([^)]+)\)/g)].map((m) => m[1].trim());
  assert.deepEqual([...new Set(used.filter((width) => !ladder.has(width)))], []);
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
  const bridge = styles.match(/:root \{\n(\s*--background:[\s\S]*?)\n\}/)?.[1];
  assert.ok(bridge, "The shadcn to Hall token bridge is missing from styles.css");
  for (const declaration of bridge.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    assert.match(declaration[2], /^var\(--hall-/, `${declaration[1]} must alias a Hall token`);
  }
  for (const required of ["--primary", "--background", "--foreground", "--border", "--ring"]) {
    assert.match(bridge, new RegExp(`\\${required}:`), `${required} is missing from the shadcn bridge`);
  }
});

test("the abandoned component libraries leave no trace", () => {
  assert.doesNotMatch(applicationSource, /@fluentui\//, "Fluent UI must not be imported");
  assert.doesNotMatch(applicationSource, /from "lucide-react"/, "Icons must come from the local Phosphor module");
});
