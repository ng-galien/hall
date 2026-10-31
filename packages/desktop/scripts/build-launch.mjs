import { copyFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const desktopRoot = resolve(import.meta.dirname, "..");
const outputDirectory = join(desktopRoot, "dist", "launch");

await mkdir(outputDirectory, { recursive: true });
await build({
  entryPoints: [join(desktopRoot, "src", "launch", "main.ts")],
  outdir: outputDirectory,
  entryNames: "main",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome140",
  minify: true,
  loader: { ".woff2": "file", ".woff": "file" },
  assetNames: "fonts/[name]-[hash]",
  logLevel: "warning",
});
await copyFile(join(desktopRoot, "src", "launch", "index.html"), join(outputDirectory, "index.html"));
