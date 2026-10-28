import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const content = resolve(root, "packages/client/src/docs/content");
const captures = resolve(root, "packages/client/public/documentation/captures");
const publicDirectory = resolve(root, "packages/client/public");
const imagePattern = /!\[[^\]]*\]\((\/app\/documentation\/captures\/[^)\s]+)\)/g;

function filesBelow(directory, extension) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesBelow(path, extension);
    return entry.name.endsWith(extension) ? [path] : [];
  });
}

const references = filesBelow(content, ".mdx").flatMap((page) =>
  [...readFileSync(page, "utf8").matchAll(imagePattern)].map((match) => ({
    page: relative(root, page),
    url: match[1],
  })),
);

test("every image of a documentation page exists among the captures", () => {
  assert.ok(references.length > 0, "the documentation pages reference no capture");
  const missing = references.filter(({ url }) => !existsSync(join(publicDirectory, url.slice("/app/".length))));
  assert.deepEqual(
    missing.map(({ page, url }) => `${page} → ${url}`),
    [],
  );
});

test("every capture is shown by at least one documentation page", () => {
  const referenced = new Set(references.map(({ url }) => url));
  const unused = filesBelow(captures, ".png")
    .map((path) => `/app/${relative(publicDirectory, path).split("\\").join("/")}`)
    .filter((url) => !referenced.has(url));
  assert.deepEqual(unused, []);
});
