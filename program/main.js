const { app, BrowserWindow, BrowserView, ipcMain, session } = require("electron");
const path = require("path");
const api = require("./lib/api");
const { readConfig, writeConfig, apiBase } = require("./lib/config");

const GOLDEN_HOST = "https://goldenbride.net";
const BAR_H = 56;

let authWindow = null;
let workWindow = null;
let siteView = null;

function ui(file) {
  return path.join(__dirname, "ui", file);
}

function createAuthWindow() {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.focus();
    return;
  }
  authWindow = new BrowserWindow({
    width: 440,
    height: 620,
    resizable: false,
    title: "Bracho",
    backgroundColor: "#12110f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  authWindow.loadFile(ui("auth.html"));
  authWindow.on("closed", () => {
    authWindow = null;
  });
}

function layoutWork() {
  if (!workWindow || !siteView) return;
  const { width, height } = workWindow.getContentBounds();
  siteView.setBounds({
    x: 0,
    y: BAR_H,
    width,
    height: Math.max(height - BAR_H, 100),
  });
  siteView.setAutoResize({ width: true, height: true });
}

/**
 * Golden Bride login — same as HelpChat golden.js autofillLogin:
 * POST /goldenbride/services/login with username, userpass, doremember
 */
function goldenLoginScript(login, password) {
  return `
    (async () => {
      const body = new URLSearchParams({
        username: ${JSON.stringify(String(login))},
        userpass: ${JSON.stringify(String(password))},
        doremember: 'true',
      });
      await fetch('/goldenbride/services/login', {
        method: 'POST',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        body: body.toString(),
        credentials: 'include',
      });
      window.location.href = '/lady';
      return true;
    })();
  `;
}

async function openGoldenChat(anketa) {
  if (workWindow && !workWindow.isDestroyed()) {
    workWindow.close();
  }

  const partition = `persist:bracho-golden-${anketa.externalId}`;
  const ses = session.fromPartition(partition);
  await ses.clearStorageData({
    storages: ["cookies", "localstorage", "indexdb", "shadercache", "serviceworkers"],
  }).catch(() => {});

  workWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: `Bracho — ${anketa.displayName}`,
    backgroundColor: "#12110f",
    webPreferences: {
      preload: path.join(__dirname, "preload-bar.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await workWindow.loadFile(ui("workspace.html"), {
    query: {
      name: anketa.displayName,
      id: anketa.externalId,
    },
  });

  siteView = new BrowserView({
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  workWindow.addBrowserView(siteView);
  layoutWork();
  workWindow.on("resize", layoutWork);

  const wc = siteView.webContents;
  let loginDone = false;

  const tryLogin = async () => {
    if (loginDone) return;
    const url = wc.getURL() || "";
    if (!url.includes("goldenbride.net")) return;
    // already in chat/lady after redirect
    if (url.includes("/chat") || (url.includes("/lady") && loginDone)) return;
    loginDone = true;
    try {
      await wc.executeJavaScript(goldenLoginScript(anketa.externalId, anketa.password));
    } catch (e) {
      loginDone = false;
      console.error("Golden login failed", e);
    }
  };

  wc.on("did-finish-load", () => {
    setTimeout(tryLogin, 500);
  });

  workWindow.on("closed", () => {
    workWindow = null;
    siteView = null;
  });

  if (authWindow && !authWindow.isDestroyed()) authWindow.close();

  await wc.loadURL(`${GOLDEN_HOST}/lady`);
}

ipcMain.handle("auth:login", async (_e, { email, password }) => {
  try {
    const data = await api.login(email, password);
    return { ok: true, user: data.user };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("auth:logout", async () => {
  api.logout();
  return { ok: true };
});

ipcMain.handle("auth:session", async () => {
  const cfg = readConfig();
  return { user: cfg.user || null, hasToken: !!cfg.token };
});

ipcMain.handle("ankety:list", async () => {
  try {
    const data = await api.fetchMyAnkety();
    return { ok: true, ...data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("anketa:open", async (_e, anketa) => {
  if (!anketa?.externalId || !anketa?.password) {
    return { ok: false, error: "Anketa missing ID or password" };
  }
  try {
    await openGoldenChat(anketa);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("config:apiBase", async () => apiBase());
ipcMain.handle("config:setApiBase", async (_e, url) => {
  writeConfig({ apiBase: String(url || "").replace(/\/$/, "") });
  return { ok: true, apiBase: apiBase() };
});

ipcMain.handle("workspace:back", async () => {
  if (workWindow && !workWindow.isDestroyed()) workWindow.close();
  createAuthWindow();
  // load select step if still logged in
  return { ok: true };
});

app.whenReady().then(() => {
  createAuthWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createAuthWindow();
});
