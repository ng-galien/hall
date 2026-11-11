import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "vitest";

const clientRoot = join(import.meta.dirname, "..");
const sourceRoot = join(clientRoot, "src");
const read = (path) => readFileSync(join(sourceRoot, path), "utf8");

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

function luminance(hex) {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r, g, b] = channels.map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(left, right) {
  const [high, low] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}
function tokenBlock(selector) {
  const tokens = read("styles/tokens.css");
  const start = tokens.indexOf(`${selector} {`);
  return tokens.slice(start, tokens.indexOf("\n}", start));
}
function token(block, name) {
  return block.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`, "i"))?.[1];
}

// @verifies-requirement HALL-FR-LAY-070
test("every resource nature reaches 3:1 on the surface in both themes", () => {
  const natures = ["writing", "data", "visual", "council", "folder"];
  for (const selector of [":root", ':root[data-theme="dark"]']) {
    const block = tokenBlock(selector);
    const surface = token(block, "hall-color-surface");
    for (const nature of natures) {
      const colour = token(block, `hall-color-nature-${nature}`);
      assert.ok(colour, `${selector} declares no ${nature} nature`);
      assert.ok(contrast(colour, surface) >= 3, `${selector} ${nature} ${colour} is under 3:1 on ${surface}`);
    }
  }
});

// @verifies-requirement HALL-TR-LAY-020
test("only ListRow renders a list row", () => {
  const owners = files.filter(({ source }) => /data-slot="list-row"/.test(source)).map(({ path }) => path);
  assert.deepEqual(owners, ["components/ui/list-row.tsx"]);
});

// @verifies-requirement HALL-FR-LAY-070
test("type icons are outlines tinted by their nature, never a padded badge", () => {
  const listRow = read("components/ui/list-row.tsx");
  assert.doesNotMatch(listRow, /weight="(?:fill|duotone|bold)"/);
  const removed = /\bworkspace-glyph\b|--resource-tone-(?:color|surface)|editor-reference-tone-/;
  assert.deepEqual(
    files.filter(({ source }) => removed.test(source)).map(({ path }) => path),
    [],
  );
});

const retiredClasses = [];
const retiredFiles = [];
const listFiles = [];

// @verifies-requirement HALL-TR-LAY-020
test("retired row classes and components do not come back", () => {
  for (const name of retiredClasses) {
    const pattern = new RegExp(`(?<![\\w-])${name}(?![\\w-])`);
    const offenders = files.filter(({ source }) => pattern.test(source)).map(({ path }) => path);
    assert.deepEqual(offenders, [], `${name} is still used`);
  }
  for (const path of retiredFiles) assert.equal(existsSync(join(sourceRoot, path)), false, `${path} still exists`);
});

// @verifies-requirement HALL-TR-LAY-020
test("every list of the inventory is rendered by ListRow", () => {
  for (const path of listFiles) {
    assert.match(read(path), /from "[^"]*components\/ui\/list-row"/, `${path} does not import ListRow`);
  }
});
