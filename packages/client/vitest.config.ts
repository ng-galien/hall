import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Keep OpenLayers' class identity shared between its root and deep imports.
      server: { deps: { inline: ["ol"] } },
      deps: {
        optimizer: {
          // Bundle the icon catalogue once instead of evaluating thousands of modules in every isolated worker.
          client: { enabled: true, include: ["@phosphor-icons/react"], exclude: ["ol"] },
        },
      },
    },
  }),
);
