import { resolve } from "node:path";

export default {
  packagerConfig: {
    name: "Mairie",
    executableName: "Mairie",
    asar: true,
    extraResource: [resolve(import.meta.dirname, "../client/dist")],
    ignore: [/^\/(?:src|scripts|out)(?:\/|$)/, /^\/(?:forge\.config\.mjs|tsconfig\.json)$/],
  },
  makers: [
    { name: "@electron-forge/maker-squirrel", config: { name: "mairie" } },
    { name: "@electron-forge/maker-zip", platforms: ["darwin"] },
    { name: "@electron-forge/maker-deb", config: { options: { bin: "Mairie" } } },
    { name: "@electron-forge/maker-rpm", config: { options: { bin: "Mairie" } } },
  ],
};
