import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

import { hallDocsMdx } from "./mdx.mjs";

/* The documentation as one self-contained HTML file (`npm run build:docs` builds dist-docs/index.html):
   scripts, styles and fonts inlined, hash routing; it opens from a file:// URL and can be sent as a zip. */
export default defineConfig({
  plugins: [hallDocsMdx(), react(), tailwindcss(), viteSingleFile({ removeViteModuleLoader: true })],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  define: { "import.meta.env.VITE_HALL_DOCS_STANDALONE": JSON.stringify("1") },
  // The application's public files (icons, installation files) do not belong in the standalone site.
  publicDir: false,
  build: {
    outDir: "dist-docs",
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000,
    rollupOptions: { input: "docs-site.html" },
  },
});
