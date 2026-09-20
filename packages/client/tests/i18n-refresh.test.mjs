import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { test } from "vitest";

const require = createRequire(import.meta.url);
const root = join(import.meta.dirname, "../src/i18n");

function moduleLoader() {
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} };
    cache.set(path, module);
    const source = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const localRequire = (id) => {
      if (!id.startsWith(".")) return require(id);
      const base = join(dirname(path), id);
      try {
        return load(`${base}.ts`);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        return load(`${base}.tsx`);
      }
    };
    new Function("require", "module", "exports", source)(localRequire, module, module.exports);
    return module.exports;
  }
  return { load, invalidate: (path) => cache.delete(path) };
}

test("a refreshed provider retains the context used by already loaded consumers", () => {
  const loader = moduleLoader();
  const providerPath = join(root, "I18nProvider.tsx");
  const { useI18n } = loader.load(providerPath);
  const Consumer = () => createElement("span", null, useI18n().t("common.cancel"));
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => "fr" } });
  try {
    const first = loader.load(providerPath).I18nProvider;
    assert.match(renderToStaticMarkup(createElement(first, null, createElement(Consumer))), /Annuler/);
    loader.invalidate(providerPath);
    const refreshed = loader.load(providerPath).I18nProvider;
    assert.match(renderToStaticMarkup(createElement(refreshed, null, createElement(Consumer))), /Annuler/);
    assert.throws(() => renderToStaticMarkup(createElement(Consumer)), /inside I18nProvider/);
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else delete globalThis.localStorage;
  }
});
