import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        index: "index.html",
        assemblage: "assemblage/index.html",
        relief: "relief/index.html",
        trace: "trace/index.html",
      },
    },
  },
});
