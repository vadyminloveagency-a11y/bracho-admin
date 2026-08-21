const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("brachoBar", {
  exit: () => ipcRenderer.invoke("workspace:exit"),
  addLady: () => ipcRenderer.invoke("workspace:add-lady"),
  selectTab: (key) => ipcRenderer.invoke("workspace:select-tab", key),
  closeTab: (key) => ipcRenderer.invoke("workspace:close-tab", key),
  reloadTab: () => ipcRenderer.invoke("workspace:reload-tab"),
  zoomBy: (delta) => ipcRenderer.invoke("workspace:zoom", delta),
  zoomSet: (value) => ipcRenderer.invoke("workspace:zoom-set", value),
  getState: () => ipcRenderer.invoke("workspace:state"),
  onState: (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on("workspace:state", handler);
    return () => ipcRenderer.removeListener("workspace:state", handler);
  },
  onZoom: (cb) => {
    const handler = (_e, payload) => cb(payload || {});
    ipcRenderer.on("workspace:zoom", handler);
    return () => ipcRenderer.removeListener("workspace:zoom", handler);
  },
  onLoading: (cb) => {
    const handler = (_e, payload) => cb(payload || {});
    ipcRenderer.on("workspace:loading", handler);
    return () => ipcRenderer.removeListener("workspace:loading", handler);
  },
});
