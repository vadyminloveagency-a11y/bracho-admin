const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bracho", {
  login: (email, password, remember) =>
    ipcRenderer.invoke("auth:login", { email, password, remember: Boolean(remember) }),
  logout: () => ipcRenderer.invoke("auth:logout"),
  getSavedLogin: () => ipcRenderer.invoke("auth:saved-login"),
  getAnkety: () => ipcRenderer.invoke("ankety:list"),
  openAnketa: (anketa) => ipcRenderer.invoke("anketa:open", anketa),
  openAnketyBatch: (list) => ipcRenderer.invoke("anketa:open-batch", list),
  getSession: () => ipcRenderer.invoke("auth:session"),
  getApiBase: () => ipcRenderer.invoke("config:apiBase"),
  setApiBase: (url) => ipcRenderer.invoke("config:setApiBase", url),
  backToChats: () => ipcRenderer.invoke("workspace:back-to-chats"),
  onShowAnkety: (cb) => {
    const handler = (_e, payload) => cb(payload || {});
    ipcRenderer.on("ui:show-ankety", handler);
    return () => ipcRenderer.removeListener("ui:show-ankety", handler);
  },
  onBatchProgress: (cb) => {
    const handler = (_e, payload) => cb(payload || {});
    ipcRenderer.on("anketa:batch-progress", handler);
    return () => ipcRenderer.removeListener("anketa:batch-progress", handler);
  },
});
