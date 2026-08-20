const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bracho", {
  login: (email, password) => ipcRenderer.invoke("auth:login", { email, password }),
  logout: () => ipcRenderer.invoke("auth:logout"),
  getAnkety: () => ipcRenderer.invoke("ankety:list"),
  openAnketa: (anketa) => ipcRenderer.invoke("anketa:open", anketa),
  getSession: () => ipcRenderer.invoke("auth:session"),
  getApiBase: () => ipcRenderer.invoke("config:apiBase"),
  setApiBase: (url) => ipcRenderer.invoke("config:setApiBase", url),
});
