import { resolve } from "node:path";
import { browserDirectory, copyProductionRuntime, prepareBrowserRuntime } from "./scripts/package-runtime.mjs";

export default {
  packagerConfig: {
    name: "Hall",
    executableName: "Hall",
    asar: { unpack: "**/*.node" },
    prune: false,
    extraResource: [resolve(import.meta.dirname, "../client/dist"), browserDirectory],
    ignore: [
      /^\/(?:src|scripts|out|node_modules)(?:\/|$)/,
      /^\/dist\/playwright(?:\/|$)/,
      /^\/(?:forge\.config\.mjs|tsconfig\.json)$/,
    ],
  },
  hooks: {
    prePackage: (_config, platform, arch) => prepareBrowserRuntime(platform, arch),
    packageAfterCopy: (_config, buildPath) => copyProductionRuntime(buildPath),
  },
  makers: [
    { name: "@electron-forge/maker-squirrel", config: { name: "hall" } },
    { name: "@electron-forge/maker-zip", platforms: ["darwin"] },
    { name: "@electron-forge/maker-deb", config: { options: { bin: "Hall" } } },
    { name: "@electron-forge/maker-rpm", config: { options: { bin: "Hall" } } },
  ],
};
