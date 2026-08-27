import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const sourceRoot = join(import.meta.dirname, "..", "src");
const tokens = readFileSync(join(sourceRoot, "styles", "tokens.css"), "utf8");
const styles = [
  "styles.css",
  "styles/base.css",
  "styles/components.css",
  "styles/live.css",
  "styles/meeting-workspace.css",
]
  .map((path) => readFileSync(join(sourceRoot, path), "utf8"))
  .join("\n");
const fluentTheme = readFileSync(join(sourceRoot, "theme", "fluentTheme.ts"), "utf8");

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(css|ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const applicationSource = sourceFiles(sourceRoot)
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

test("visual values have one CSS token source", () => {
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b|rgba?\(/i);
  assert.doesNotMatch(fluentTheme, /#[0-9a-f]{3,8}\b|rgba?\(/i);
});

test("every CSS variable used by CSS, Tailwind classes, or Fluent resolves", () => {
  const declarations = new Set([...`${tokens}\n${styles}`.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
  const references = [
    ...applicationSource.matchAll(/var\((--[\w-]+)\)/g),
    ...applicationSource.matchAll(/\((--[\w-]+)\)/g),
  ].map((match) => match[1]);
  assert.deepEqual([...new Set(references.filter((reference) => !declarations.has(reference)))], []);
  assert.doesNotMatch(applicationSource, /--(?:header-height|sidebar-width|sidebar-compact-width)\b/);
});

test("Tailwind and Fluent bridge to the same Mairie token namespace", () => {
  const themeBlock = styles.match(/@theme inline \{([\s\S]*?)\}/)?.[1] ?? "";
  assert.ok(themeBlock.length > 0);
  for (const declaration of themeBlock.matchAll(/--[\w-]+:\s*([^;]+);/g)) {
    assert.match(declaration[1], /^var\(--mairie-/);
  }
  assert.match(fluentTheme, /colorBrandBackground: "var\(--mairie-color-brand\)"/);
  assert.match(fluentTheme, /fontFamilyBase: "var\(--mairie-font-family-sans\)"/);
  assert.match(styles, /--font-weight-semibold: var\(--mairie-font-weight-semibold\)/);
  assert.doesNotMatch(applicationSource, /\bduration-\d+\b|tracking-\[[^\]]+\]/);
  assert.doesNotMatch(applicationSource, /\banimate-pulse\b|\bease-out\b/);
});

test("every Fluent token used by the rendered component set bridges to Mairie tokens", () => {
  const projectRoot = join(import.meta.dirname, "..", "..", "..");
  const fluentStyleFiles = [
    "react-badge/lib-commonjs/components/Badge/useBadgeStyles.styles.raw.cjs",
    "react-button/lib-commonjs/components/Button/useButtonStyles.styles.raw.cjs",
    "react-card/lib-commonjs/components/Card/useCardStyles.styles.raw.cjs",
    "react-card/lib-commonjs/components/CardHeader/useCardHeaderStyles.styles.raw.cjs",
    "react-field/lib-commonjs/components/Field/useFieldStyles.styles.raw.cjs",
    "react-input/lib-commonjs/components/Input/useInputStyles.styles.raw.cjs",
    "react-label/lib-commonjs/components/Label/useLabelStyles.styles.raw.cjs",
    "react-text/lib-commonjs/components/Text/useTextStyles.styles.raw.cjs",
    "react-textarea/lib-commonjs/components/Textarea/useTextareaStyles.styles.raw.cjs",
  ];
  const usedTokens = new Set(
    fluentStyleFiles.flatMap((path) => {
      const source = readFileSync(join(projectRoot, "node_modules", "@fluentui", path), "utf8");
      return [...source.matchAll(/_reacttheme\.tokens\.([A-Za-z0-9_]+)/g)].map((match) => match[1]);
    }),
  );
  const missing = [...usedTokens].filter(
    (token) => !new RegExp(`\\b${token}:\\s*[^\\n,]*var\\(--mairie-`).test(fluentTheme),
  );
  assert.deepEqual(missing, []);
});
