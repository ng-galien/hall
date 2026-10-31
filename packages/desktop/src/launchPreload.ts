import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("hallLaunch", {
  reportLeft: () => ipcRenderer.send("hall-launch:left"),
  open: () => ipcRenderer.send("hall-launch:open"),
  onStage: (listener: (stage: string) => void) => {
    ipcRenderer.on("hall-launch:stage", (_event, stage: string) => listener(stage));
  },
  onLeave: (listener: () => void) => {
    ipcRenderer.once("hall-launch:leave", () => listener());
  },
});
