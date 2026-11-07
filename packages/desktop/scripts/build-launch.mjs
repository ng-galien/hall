import { copyFile, cp, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const desktopRoot = resolve(import.meta.dirname, "..");
const outputDirectory = join(desktopRoot, "dist", "launch");
const siteRoot = resolve(desktopRoot, "..", "..", "site");

/** Le module du relief vient du site public : three y est résolu depuis le paquet desktop, embarqué une fois. */
const sharedThree = {
  name: "shared-three",
  setup(build) {
    build.onResolve({ filter: /^three(\/.*)?$/ }, (args) =>
      args.resolveDir.startsWith(siteRoot) && !args.pluginData
        ? build.resolve(args.path, { kind: args.kind, resolveDir: desktopRoot, pluginData: true })
        : undefined,
    );
  },
};

// Packaged resources belong to this application build; they need no HTTP cache version.
const packagedPublicFiles = {
  name: "packaged-public-files",
  setup(build) {
    build.onResolve({ filter: /^virtual:public-file-versions$/ }, () => ({
      path: "public-file-versions",
      namespace: "hall-packaged-resources",
    }));
    build.onLoad({ filter: /.*/, namespace: "hall-packaged-resources" }, () => ({
      contents: "export default {};",
      loader: "js",
    }));
  },
};

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
  plugins: [sharedThree, packagedPublicFiles],
});
await copyFile(join(desktopRoot, "src", "launch", "index.html"), join(outputDirectory, "index.html"));
await cp(join(siteRoot, "public", "terrain"), join(outputDirectory, "terrain"), { recursive: true });
