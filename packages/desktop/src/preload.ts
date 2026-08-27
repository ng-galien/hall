import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("mairieDesktop", {
  platform: process.platform,
  versions: process.versions,
});
