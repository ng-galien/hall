import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "vitest";

const sourceRoot = join(import.meta.dirname, "..", "src");

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(css|ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}
const files = sourceFiles(sourceRoot).map((path) => ({
  path: relative(sourceRoot, path),
  source: readFileSync(path, "utf8"),
}));
const offenders = (pattern, scope = () => true) =>
  files.filter((file) => scope(file) && pattern.test(file.source)).map(({ path }) => path);

/** Opening tags of a JSX element, read across lines. */
function openingTags(source, element) {
  const tags = [];
  for (const match of source.matchAll(new RegExp(`<${element}(?=[\\s>/])`, "g"))) {
    let depth = 0;
    let quote = null;
    for (let index = match.index + element.length + 1; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (character === quote) quote = null;
      } else if (character === '"' || (depth > 0 && (character === "'" || character === "`"))) quote = character;
      else if (character === "{") depth += 1;
      else if (character === "}") depth -= 1;
      else if (character === ">" && depth === 0) {
        tags.push(source.slice(match.index, index + 1));
        break;
      }
    }
  }
  return tags;
}

// @verifies-requirement HALL-TR-LAY-030
// @verifies-requirement HALL-FR-LAY-090
test("a Button uses only the variants and sizes of choice 5B", () => {
  const allowed = { variant: new Set(["primary", "secondary", "danger", "plain"]), size: new Set(["default", "icon"]) };
  const retired = /"(?:outline|ghost|link|destructive|destructive-outline|success|sm|xs|lg|icon-xs|icon-sm|icon-lg)"/;
  const wrong = [];
  for (const { path, source } of files.filter(({ path }) => path.endsWith(".tsx"))) {
    for (const tag of openingTags(source, "Button")) {
      for (const [attribute, expression] of tag
        .matchAll(/\b(variant|size)=("[^"]*"|\{[^}]*\})/g)
        .map((m) => [m[1], m[2]])) {
        if (expression.startsWith('"') && !allowed[attribute].has(expression.slice(1, -1)))
          wrong.push(`${path}: ${attribute}=${expression}`);
        if (expression.startsWith("{") && retired.test(expression)) wrong.push(`${path}: ${attribute}=${expression}`);
      }
    }
  }
  assert.deepEqual(wrong, []);
  assert.doesNotMatch(readFileSync(join(sourceRoot, "components/ui/button.tsx"), "utf8"), /outline|ghost|destructive/);
});

// @verifies-requirement HALL-TR-LAY-030
// @verifies-requirement HALL-FR-LAY-100
test("screens are white: the grey page canvas does not come back", () => {
  assert.deepEqual(offenders(/--hall-color-canvas\b/), []);
});
