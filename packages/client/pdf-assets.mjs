import { createReadStream, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/* Binary decoders and substitute fonts that PDF rendering loads by name from the application itself. */

const pdfjsRoot = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
const wasmFiles = ["jbig2.wasm", "openjpeg.wasm", "qcms_bg.wasm"];
const fontFiles = readdirSync(join(pdfjsRoot, "standard_fonts")).filter((name) => /\.(pfb|ttf)$/.test(name));

export const pdfAssetPaths = [
  ...wasmFiles.map((name) => `wasm/${name}`),
  ...fontFiles.map((name) => `standard_fonts/${name}`),
];

export function hallPdfAssets() {
  let base = "/";
  return {
    name: "hall-pdf-assets",
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      server.middlewares.use(`${base}pdfjs`, (request, response, next) => {
        const path = (request.url ?? "").split("?", 1)[0].replace(/^\//, "");
        if (!pdfAssetPaths.includes(path)) return next();
        createReadStream(join(pdfjsRoot, path)).pipe(response);
      });
    },
    generateBundle() {
      for (const path of pdfAssetPaths)
        this.emitFile({ type: "asset", fileName: `pdfjs/${path}`, source: readFileSync(join(pdfjsRoot, path)) });
    },
  };
}
