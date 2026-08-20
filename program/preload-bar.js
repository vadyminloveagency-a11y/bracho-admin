const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("brachoBar", {
  back: () => ipcRenderer.invoke("workspace:back"),
});
