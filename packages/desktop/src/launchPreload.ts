import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("hallLaunch", {
  reportStarted: () => ipcRenderer.send("hall-launch:started"),
  reportMeasurements: (value: string) => ipcRenderer.send("hall-launch:measurements", value),
  reportLeft: () => ipcRenderer.send("hall-launch:left"),
  open: () => ipcRenderer.send("hall-launch:open"),
  onProgress: (listener: (message: unknown) => void) => {
    ipcRenderer.on("hall-launch:progress", (_event, message: unknown) => listener(message));
  },
  onLeave: (listener: () => void) => {
    ipcRenderer.once("hall-launch:leave", () => listener());
  },
});
