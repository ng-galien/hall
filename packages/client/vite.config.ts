import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { hallDocsMdx } from "./mdx.mjs";
import { hallPdfAssets } from "./pdf-assets.mjs";
import { hallWebApp } from "./web-app.mjs";

export default defineConfig({
  plugins: [hallDocsMdx(), react(), tailwindcss(), hallWebApp(), hallPdfAssets()],
  base: "/app/",
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    host: "127.0.0.1",
    allowedHosts: (process.env.HALL_DEV_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean),
    port: 5174,
    proxy: {
      "/api": { target: process.env.VITE_API_TARGET ?? "http://127.0.0.1:3100", ws: true },
    },
  },
});
