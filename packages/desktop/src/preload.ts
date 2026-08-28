import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("hallDesktop", {
  platform: process.platform,
  versions: process.versions,
});
