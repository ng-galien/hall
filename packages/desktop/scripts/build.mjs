import { rm } from "node:fs/promises";
import { build } from "esbuild";

await rm(new URL("../dist", import.meta.url), { recursive: true, force: true });

await build({
  entryPoints: [new URL("../src/main.ts", import.meta.url).pathname],
  outfile: new URL("../dist/main.js", import.meta.url).pathname,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  external: ["electron"],
  sourcemap: true,
});

await build({
  entryPoints: [new URL("../src/preload.ts", import.meta.url).pathname],
  outfile: new URL("../dist/preload.cjs", import.meta.url).pathname,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["electron"],
  sourcemap: true,
});
