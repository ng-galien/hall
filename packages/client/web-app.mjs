import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* Installable web application: manifest, offline page and service worker, produced at build time.
   Names and offline texts come from the French translation keys; the cache name carries the
   package version and the build commit. */

const clientRoot = import.meta.dirname;
const read = (path) => readFileSync(join(clientRoot, path), "utf8");

export const THEME_COLOR = "#334155";
export const BACKGROUND_COLOR = "#f2f4f7";

export function frenchText(key) {
  const source = read("src/i18n/fr.ts");
  const escaped = key.replaceAll(".", "\\.");
  const match = source.match(new RegExp(`"${escaped}":\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  if (!match) throw new Error(`Missing French translation ${key}`);
  return JSON.parse(`"${match[1]}"`);
}

export function buildIdentity() {
  const version = JSON.parse(read("../../package.json")).version;
  const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: clientRoot, encoding: "utf8" }).stdout?.trim();
  return { version, commit: commit || "uncommitted" };
}

export function renderManifest(base) {
  return {
    id: base,
    name: frenchText("app.windowTitle"),
    short_name: frenchText("app.shortName"),
    lang: "fr",
    dir: "ltr",
    start_url: base,
    scope: base,
    display: "standalone",
    background_color: BACKGROUND_COLOR,
    theme_color: THEME_COLOR,
    icons: [
      { src: `${base}icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${base}icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${base}icons/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

const escapeHtml = (text) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function renderOfflinePage() {
  const icon = read("public/icons/favicon.svg").replace("<svg ", '<svg aria-hidden="true" ').trim();
  const values = {
    __THEME_COLOR__: THEME_COLOR,
    __TITLE__: escapeHtml(frenchText("app.windowTitle")),
    __HEADING__: escapeHtml(frenchText("app.offlineHeading")),
    __MESSAGE__: escapeHtml(frenchText("app.offlineMessage")),
    __RETRY__: escapeHtml(frenchText("app.offlineRetry")),
    __ICON__: icon,
  };
  return Object.entries(values).reduce((page, [marker, value]) => page.replaceAll(marker, value), read("web-app/offline.html"));
}

export function cacheName({ version, commit }) {
  return `hall-offline-${version}-${commit}`;
}

export function renderServiceWorker(identity) {
  return read("web-app/service-worker.js").replace("__HALL_CACHE_NAME__", cacheName(identity));
}

export function hallWebApp() {
  let base = "/";
  return {
    name: "hall-web-app",
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml() {
      return [
        { tag: "link", attrs: { rel: "manifest", href: `${base}manifest.webmanifest` }, injectTo: "head" },
        { tag: "meta", attrs: { name: "theme-color", content: THEME_COLOR }, injectTo: "head" },
      ];
    },
    configureServer(server) {
      server.middlewares.use(`${base}manifest.webmanifest`, (_request, response) => {
        response.setHeader("Content-Type", "application/manifest+json");
        response.end(JSON.stringify(renderManifest(base)));
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "manifest.webmanifest", source: `${JSON.stringify(renderManifest(base), null, 2)}\n` });
      this.emitFile({ type: "asset", fileName: "offline.html", source: renderOfflinePage() });
      this.emitFile({ type: "asset", fileName: "sw.js", source: renderServiceWorker(buildIdentity()) });
    },
  };
}
