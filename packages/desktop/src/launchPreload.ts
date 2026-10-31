import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("hallLaunch", {
  reportFinal: () => ipcRenderer.send("hall-launch:final"),
  reportLeft: () => ipcRenderer.send("hall-launch:left"),
  onLeave: (listener: () => void) => {
    ipcRenderer.once("hall-launch:leave", () => listener());
  },
});
