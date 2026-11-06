import { copyFile, cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "hall-rendered-documentation",
      async closeBundle() {
        const target = fileURLToPath(new URL("./dist/documentation/", import.meta.url));
        await mkdir(target, { recursive: true });
        await cp(
          fileURLToPath(new URL("../packages/client/public/documentation/captures/", import.meta.url)),
          `${target}/captures`,
          { recursive: true },
        );
        await copyFile(
          fileURLToPath(new URL("../packages/client/dist-docs/index.html", import.meta.url)),
          `${target}/index.html`,
        );
      },
    },
  ],
  server: {
    allowedHosts: [".ts.net"],
  },
  preview: {
    allowedHosts: [".ts.net"],
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        demonstration: fileURLToPath(new URL("./demonstration/index.html", import.meta.url)),
      },
    },
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
});
