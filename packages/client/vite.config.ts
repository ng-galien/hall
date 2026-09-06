import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { hallDocsMdx } from "./mdx.mjs";

export default defineConfig({
  plugins: [hallDocsMdx(), react(), tailwindcss()],
  base: "/app/",
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    host: "127.0.0.1",
    allowedHosts: ["dev-host.example.test"],
    port: 5174,
    proxy: { "/api": process.env.VITE_API_TARGET ?? "http://127.0.0.1:3100" },
  },
});
