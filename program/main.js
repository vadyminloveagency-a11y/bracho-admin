const { app, BrowserWindow, BrowserView, ipcMain, session, screen, Menu } = require("electron");
const path = require("path");

// Keep Golden chat/Broadcast timers alive when the window is in the background
// or another Bracho tab is in front (Chrome would otherwise sleep the page).
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
const api = require("./lib/api");
const { readConfig, writeConfig, apiBase } = require("./lib/config");
const { hideBroadcastUiScript } = require("./lib/golden-broadcast-hide");

const GOLDEN_HOST = "https://goldenbride.net";
const BAR_H = 48;
const LOGIN_STAGGER_MS = 7000;
const HOME_AFTER_CHAT_MS = 1000;
const LADY_TAB_COLORS = [
  "#ff6b7a",
  "#5b9dff",
  "#4ade80",
  "#fbbf24",
  "#c084fc",
  "#22d3ee",
  "#fb923c",
  "#f472b6",
  "#a3e635",
  "#818cf8",
];

let authWindow = null;
let workWindow = null;
/** Shared zoom for all Golden Bride BrowserViews (1 = 100%). */
let goldenZoom = 1;

function clampZoom(z) {
  const n = Number(z);
  if (!Number.isFinite(n)) return 1;
  return Math.min(2, Math.max(0.5, Math.round(n * 10) / 10));
}

function initGoldenZoom() {
  const z = Number(readConfig().goldenZoom);
  if (Number.isFinite(z) && z > 0) goldenZoom = clampZoom(z);
}

function applyZoomToView(view) {
  if (!view || view.webContents.isDestroyed()) return;
  try {
    view.webContents.setZoomFactor(goldenZoom);
  } catch (_) {}
}

function applyZoomToAllGolden() {
  for (const s of ladies.values()) {
    applyZoomToView(s.chat);
    applyZoomToView(s.home);
  }
}

function setGoldenZoom(next) {
  goldenZoom = clampZoom(next);
  try {
    writeConfig({ goldenZoom });
  } catch (_) {}
  applyZoomToAllGolden();
  return goldenZoom;
}

/**
 * @typedef {{
 *   anketa: object,
 *   partition: string,
 *   chat: Electron.BrowserView,
 *   home: Electron.BrowserView | null,
 *   activePage: 'chat'|'home',
 *   color: string,
 * }} LadySession
 * @type {Map<string, LadySession>}
 */
const ladies = new Map();
/** ladyId (externalId) → interval for Account Manager online heartbeat */
const presenceTimers = new Map();
/** Active tab key: `${ladyId}:chat` | `${ladyId}:home` */
let activeTabKey = null;
let loginQueueBusy = false;
const PRESENCE_INTERVAL_MS = 30_000;

function anketaDbId(anketa) {
  return String(anketa?.id || "").trim() || null;
}

function stopPresence(ladyId) {
  const id = String(ladyId || "");
  const t = presenceTimers.get(id);
  if (t) clearInterval(t);
  presenceTimers.delete(id);
  const anketaId = anketaDbId(ladies.get(id)?.anketa);
  if (anketaId) api.presenceClear(anketaId).catch(() => {});
}

function startPresence(ladyId) {
  const id = String(ladyId || "");
  const session = ladies.get(id);
  const anketaId = anketaDbId(session?.anketa);
  if (!anketaId) return;
  const prev = presenceTimers.get(id);
  if (prev) clearInterval(prev);
  presenceTimers.delete(id);
  const beat = () => {
    api.presenceHeartbeat(anketaId).catch(() => {});
  };
  beat();
  presenceTimers.set(id, setInterval(beat, PRESENCE_INTERVAL_MS));
}

async function clearAllPresence() {
  for (const id of [...presenceTimers.keys()]) {
    const t = presenceTimers.get(id);
    if (t) clearInterval(t);
    presenceTimers.delete(id);
  }
  await api.presenceClear().catch(() => {});
}

function ui(file) {
  return path.join(__dirname, "ui", file);
}

function appIcon() {
  return path.join(__dirname, "assets", "icon.ico");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickLadyColor() {
  const used = new Set();
  for (const s of ladies.values()) {
    if (s.color) used.add(s.color);
  }
  return (
    LADY_TAB_COLORS.find((c) => !used.has(c)) ||
    LADY_TAB_COLORS[ladies.size % LADY_TAB_COLORS.length]
  );
}

function largeBounds() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  return {
    width: Math.max(1100, Math.min(width, 1440)),
    height: Math.max(720, Math.min(height, 900)),
  };
}

function firstName(displayName) {
  const part = String(displayName || "Lady").trim().split(/\s+/)[0];
  return part || "Lady";
}

function tabKey(ladyId, page) {
  return `${ladyId}:${page}`;
}

function parseTabKey(key) {
  const [ladyId, page] = String(key || "").split(":");
  return { ladyId, page: page === "home" ? "home" : "chat" };
}

function captureWindowState(win) {
  if (!win || win.isDestroyed()) return null;
  try {
    const maximized = win.isMaximized();
    const bounds =
      maximized && typeof win.getNormalBounds === "function"
        ? win.getNormalBounds()
        : win.getBounds();
    return { maximized, bounds };
  } catch (_) {
    return null;
  }
}

function applyWindowState(win, state) {
  if (!win || win.isDestroyed() || !state) return;
  try {
    if (state.maximized) {
      if (!win.isMaximized()) win.maximize();
      return;
    }
    if (win.isMaximized()) win.unmaximize();
    if (state.bounds) win.setBounds(state.bounds);
  } catch (_) {}
}

function createAuthWindow(opts = {}) {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.focus();
    if (opts.showAnkety) {
      authWindow.webContents.send("ui:show-ankety", {
        openIds: [...ladies.keys()],
        hasOpenTabs: ladies.size > 0,
      });
    }
    return;
  }
  const size = largeBounds();
  authWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    minWidth: 960,
    minHeight: 640,
    resizable: true,
    maximizable: true,
    title: "Bracho",
    icon: appIcon(),
    backgroundColor: "#050505",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  authWindow.once("ready-to-show", () => {
    authWindow.show();
  });
  const query = opts.showAnkety ? { step: "ankety" } : {};
  authWindow.loadFile(ui("auth.html"), { query });
  authWindow.on("closed", () => {
    authWindow = null;
  });
}

/** Flat horizontal tabs: one chat per lady + optional home tabs. */
function workspaceSnapshot() {
  const tabs = [];
  for (const [id, s] of ladies) {
    if (!s.color) s.color = pickLadyColor();
    const name = firstName(s.anketa.displayName);
    tabs.push({
      key: tabKey(id, "chat"),
      ladyId: id,
      page: "chat",
      label: name,
      meta: `ID ${s.anketa.externalId}`,
      color: s.color,
      active: activeTabKey === tabKey(id, "chat"),
    });
    if (s.home) {
      tabs.push({
        key: tabKey(id, "home"),
        ladyId: id,
        page: "home",
        label: `${name} · Home`,
        meta: "",
        color: s.color,
        active: activeTabKey === tabKey(id, "home"),
      });
    }
  }
  const activeLadyId = activeTabKey ? parseTabKey(activeTabKey).ladyId : null;
  return {
    tabs,
    openIds: [...ladies.keys()],
    activeTabKey,
    activeLadyId,
    zoom: goldenZoom,
  };
}

function sendToBars(channel, payload) {
  const win = workWindow;
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.send(channel, payload);
  } catch (_) {}
}

function pushWorkspace() {
  sendToBars("workspace:state", workspaceSnapshot());
}

function setWorkspaceLoading(on, message = "") {
  if (!workWindow || workWindow.isDestroyed()) return;
  if (on) hideAllViews();
  workWindow.webContents.send("workspace:loading", {
    on: Boolean(on),
    message: String(message || ""),
  });
}

function hideAllViews() {
  if (!workWindow || workWindow.isDestroyed()) return;
  for (const s of ladies.values()) {
    for (const view of [s.chat, s.home]) {
      if (view) parkView(view);
    }
  }
}

function attachView(view) {
  if (!workWindow || workWindow.isDestroyed() || !view) return;
  try {
    const attached = workWindow.getBrowserViews().includes(view);
    if (!attached) workWindow.addBrowserView(view);
  } catch (_) {}
}

function parkView(view) {
  if (!workWindow || workWindow.isDestroyed() || !view) return;
  attachView(view);
  try {
    const { width, height } = workWindow.getContentBounds();
    const w = Math.max(width, 800);
    const h = Math.max(height - BAR_H, 600);
    view.setBounds({ x: -(w + 120), y: BAR_H, width: w, height: h });
    view.setAutoResize({ width: false, height: false });
  } catch (_) {}
}

function layoutActiveView() {
  if (!workWindow || workWindow.isDestroyed()) return;
  const { width, height } = workWindow.getContentBounds();
  const w = Math.max(width, 100);
  const h = Math.max(height - BAR_H, 100);
  const visible = { x: 0, y: BAR_H, width: w, height: h };

  let activeView = null;
  for (const [id, s] of ladies) {
    const chatActive = activeTabKey === tabKey(id, "chat");
    const homeActive = activeTabKey === tabKey(id, "home");
    if (s.chat) {
      if (chatActive) {
        attachView(s.chat);
        try {
          s.chat.setBounds(visible);
          s.chat.setAutoResize({ width: true, height: true });
        } catch (_) {}
        activeView = s.chat;
      } else {
        parkView(s.chat);
      }
    }
    if (s.home) {
      if (homeActive) {
        attachView(s.home);
        try {
          s.home.setBounds(visible);
          s.home.setAutoResize({ width: true, height: true });
        } catch (_) {}
        activeView = s.home;
      } else {
        parkView(s.home);
      }
    }
  }
  if (activeView && typeof workWindow.setTopBrowserView === "function") {
    try {
      workWindow.setTopBrowserView(activeView);
    } catch (_) {}
  }
}

function blockReloadShortcuts(wc) {
  if (!wc || wc.isDestroyed()) return;
  wc.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const key = String(input.key || "").toLowerCase();
    if (key === "f5") {
      event.preventDefault();
      return;
    }
    if ((input.control || input.meta) && (key === "r" || key === "f5")) {
      event.preventDefault();
    }
  });
}

/** Force Golden Bride to reflow after BrowserView size changes. */
function bumpActivePageLayout() {
  layoutActiveView();
  if (!workWindow || workWindow.isDestroyed() || !activeTabKey) return;
  const { ladyId, page } = parseTabKey(activeTabKey);
  const session = ladies.get(ladyId);
  const view = page === "home" ? session?.home : session?.chat;
  if (!view || view.webContents.isDestroyed()) return;
  view.webContents
    .executeJavaScript(
      `(() => {
        try {
          window.dispatchEvent(new Event('resize'));
          document.body && document.body.offsetHeight;
        } catch (_) {}
        return true;
      })();`,
      true,
    )
    .catch(() => {});
}

function scheduleLayoutFix() {
  layoutActiveView();
  setTimeout(bumpActivePageLayout, 50);
  setTimeout(bumpActivePageLayout, 200);
  setTimeout(bumpActivePageLayout, 500);
  setTimeout(bumpActivePageLayout, 1000);
}

function selectTab(key) {
  if (!workWindow || workWindow.isDestroyed()) return false;
  const { ladyId, page } = parseTabKey(key);
  const next = ladies.get(ladyId);
  if (!next) return false;
  if (page === "home" && !next.home) return false;

  hideAllViews();
  activeTabKey = tabKey(ladyId, page);
  next.activePage = page;
  const view = page === "home" ? next.home : next.chat;
  workWindow.setTitle(`Bracho — ${next.anketa.displayName}`);
  attachView(view);
  layoutActiveView();
  scheduleLayoutFix();
  pushWorkspace();
  return true;
}

function ensureWorkWindow() {
  if (workWindow && !workWindow.isDestroyed()) return workWindow;

  const size = largeBounds();
  workWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    minWidth: 960,
    minHeight: 640,
    title: "Bracho",
    icon: appIcon(),
    backgroundColor: "#050505",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload-bar.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  workWindow.loadFile(ui("workspace.html"));
  blockReloadShortcuts(workWindow.webContents);
  syncWorkWindowSize();
  keepWorkWindowHidden();
  workWindow.on("resize", () => {
    layoutActiveView();
    bumpActivePageLayout();
  });
  workWindow.on("maximize", scheduleLayoutFix);
  workWindow.on("unmaximize", scheduleLayoutFix);
  // If something tries to show the window mid-login, pull it back until ready.
  workWindow.on("show", () => {
    if (loginQueueBusy) keepWorkWindowHidden();
  });
  workWindow.on("closed", () => {
    for (const s of ladies.values()) {
      for (const view of [s.chat, s.home]) {
        if (!view) continue;
        try {
          view.webContents.destroy();
        } catch (_) {}
      }
    }
    ladies.clear();
    activeTabKey = null;
    workWindow = null;
    const cfg = readConfig();
    if (cfg.token) {
      if (authWindow && !authWindow.isDestroyed()) {
        authWindow.show();
        authWindow.focus();
        authWindow.webContents.send("ui:show-ankety", {
          openIds: [],
          hasOpenTabs: false,
        });
      } else {
        createAuthWindow({ showAnkety: true });
      }
    }
  });

  return workWindow;
}

function showWorkWindow() {
  if (!workWindow || workWindow.isDestroyed()) return;
  if (authWindow && !authWindow.isDestroyed() && authWindow.isVisible()) {
    applyWindowState(workWindow, captureWindowState(authWindow));
    authWindow.hide();
  }
  workWindow.show();
  workWindow.focus();
  layoutActiveView();
  scheduleLayoutFix();
  pushWorkspace();
}

function showPickerKeepingSessions() {
  if (workWindow && !workWindow.isDestroyed()) {
    if (authWindow && !authWindow.isDestroyed()) {
      applyWindowState(authWindow, captureWindowState(workWindow));
    }
    workWindow.hide();
  }
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.show();
    authWindow.focus();
    authWindow.webContents.send("ui:show-ankety", {
      openIds: [...ladies.keys()],
      hasOpenTabs: ladies.size > 0,
    });
  } else {
    createAuthWindow({ showAnkety: true });
  }
}

function goldenLoginScript(login, password) {
  return `
    (async () => {
      const body = new URLSearchParams({
        username: ${JSON.stringify(String(login))},
        userpass: ${JSON.stringify(String(password))},
        doremember: 'true',
      });
      const res = await fetch('/goldenbride/services/login', {
        method: 'POST',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        body: body.toString(),
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Golden login HTTP ' + res.status);
      }
      return true;
    })();
  `;
}

function waitForNextFinishLoad(wc, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    if (!wc || wc.isDestroyed()) {
      reject(new Error("WebContents destroyed"));
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Page load timeout"));
    }, timeoutMs);
    const onDone = () => {
      cleanup();
      resolve();
    };
    const onFail = (_e, code, desc, _validatedURL, isMainFrame) => {
      if (isMainFrame === false) return;
      if (code === -3) return;
      cleanup();
      reject(new Error(desc || `Load failed (${code})`));
    };
    function cleanup() {
      clearTimeout(timer);
      wc.removeListener("did-finish-load", onDone);
      wc.removeListener("did-fail-load", onFail);
    }
    wc.once("did-finish-load", onDone);
    wc.on("did-fail-load", onFail);
  });
}

function ensurePartitionMedia(partition) {
  const ses = session.fromPartition(partition);
  if (ses.__brachoMediaOk) return;
  ses.__brachoMediaOk = true;
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    const allow =
      permission === "media" ||
      permission === "mediaKeySystem" ||
      permission === "display-capture";
    callback(allow);
  });
  ses.setPermissionCheckHandler((_wc, permission) => {
    return (
      permission === "media" ||
      permission === "mediaKeySystem" ||
      permission === "display-capture"
    );
  });
}

function makeView(partition) {
  ensurePartitionMedia(partition);
  const view = new BrowserView({
    webPreferences: {
      partition,
      preload: path.join(__dirname, "preload-golden.js"),
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  applyZoomToView(view);
  try {
    view.webContents.setBackgroundThrottling(false);
  } catch (_) {}
  view.webContents.on("did-finish-load", () => {
    applyZoomToView(view);
    view.webContents
      .executeJavaScript(hideBroadcastUiScript(), true)
      .catch(() => {});
  });
  return view;
}

/** Keep work window invisible while Golden auth runs (never flash SIGN IN). */
function keepWorkWindowHidden() {
  if (!workWindow || workWindow.isDestroyed()) return;
  try {
    if (workWindow.isVisible()) workWindow.hide();
  } catch (_) {}
}

function syncWorkWindowSize() {
  if (!workWindow || workWindow.isDestroyed()) return;
  if (authWindow && !authWindow.isDestroyed()) {
    applyWindowState(workWindow, captureWindowState(authWindow));
  }
}

async function isGoldenLoginForm(wc) {
  try {
    return await wc.executeJavaScript(
      `(() => {
        const text = ((document.body && document.body.innerText) || '').replace(/\\s+/g, ' ');
        const hasPwd = !!document.querySelector('input[type="password"]');
        const hasSignIn = /SIGN\\s*IN/i.test(text);
        const hasLoginLabel = /Login \\(ID or e-mail\\)|Password/i.test(text);
        return Boolean((hasSignIn && hasPwd) || (hasPwd && hasLoginLabel));
      })();`,
      true,
    );
  } catch (_) {
    return false;
  }
}

async function waitUntilChatReady(wc, timeoutMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    keepWorkWindowHidden();
    const onLogin = await isGoldenLoginForm(wc);
    if (!onLogin) {
      await new Promise((r) => setTimeout(r, 500));
      if (!(await isGoldenLoginForm(wc))) return true;
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  if (await isGoldenLoginForm(wc)) {
    throw new Error("Golden login page still open — check ID/password");
  }
  return true;
}

async function loginChat(view, anketa) {
  const wc = view.webContents;
  keepWorkWindowHidden();
  await wc.loadURL(`${GOLDEN_HOST}/chat`);
  await new Promise((r) => setTimeout(r, 400));
  keepWorkWindowHidden();
  await wc.executeJavaScript(goldenLoginScript(anketa.externalId, anketa.password));
  const afterLogin = waitForNextFinishLoad(wc);
  await wc.executeJavaScript(`window.location.href = '/chat'; true;`);
  await afterLogin;
  await new Promise((r) => setTimeout(r, 600));
  await waitUntilChatReady(wc);
  keepWorkWindowHidden();
}

async function openLadySession(anketa, opts = {}) {
  const silent = Boolean(opts.silent);
  const id = String(anketa.externalId);

  if (ladies.has(id)) {
    ensureWorkWindow();
    keepWorkWindowHidden();
    syncWorkWindowSize();
    selectTab(tabKey(id, "chat"));
    await ensureHomeAfterChat(id, { silent: true });
    startPresence(id);
    if (!silent) showWorkWindow();
    else pushWorkspace();
    return { reused: true };
  }

  ensureWorkWindow();
  keepWorkWindowHidden();
  syncWorkWindowSize();
  await new Promise((resolve) => {
    if (!workWindow.webContents.isLoading()) return resolve();
    workWindow.webContents.once("did-finish-load", resolve);
  });
  await new Promise((r) => setTimeout(r, 80));
  keepWorkWindowHidden();

  const partition = `persist:bracho-golden-${id}`;
  const ses = session.fromPartition(partition);
  await ses
    .clearStorageData({
      storages: [
        "cookies",
        "localstorage",
        "indexdb",
        "shadercache",
        "serviceworkers",
        "cachestorage",
      ],
    })
    .catch(() => {});
  await ses.clearCache().catch(() => {});
  const chat = makeView(partition);
  ladies.set(id, {
    anketa,
    partition,
    chat,
    home: null,
    activePage: "chat",
    color: pickLadyColor(),
  });

  // Attach while hidden so Golden SIGN IN never flashes.
  hideAllViews();
  activeTabKey = tabKey(id, "chat");
  workWindow.addBrowserView(chat);
  layoutActiveView();
  keepWorkWindowHidden();

  try {
    await loginChat(chat, anketa);
    bumpActivePageLayout();
    keepWorkWindowHidden();
  } catch (e) {
    stopPresence(id);
    ladies.delete(id);
    try {
      workWindow.removeBrowserView(chat);
    } catch (_) {}
    try {
      chat.webContents.destroy();
    } catch (_) {}
    throw e;
  }

  selectTab(tabKey(id, "chat"));
  keepWorkWindowHidden();
  await ensureHomeAfterChat(id, { silent: true });
  keepWorkWindowHidden();
  startPresence(id);
  if (!silent) showWorkWindow();
  else pushWorkspace();
  return { reused: false };
}

async function ensureHomeAfterChat(ladyId, opts = {}) {
  const session = ladies.get(String(ladyId));
  if (!session || session.home) return { ok: true, reused: true };
  keepWorkWindowHidden();
  await sleep(HOME_AFTER_CHAT_MS);
  keepWorkWindowHidden();
  return openHomeForLady(ladyId, opts);
}

async function openHomeForLady(ladyId, opts = {}) {
  const silent = Boolean(opts.silent);
  const id = String(ladyId || parseTabKey(activeTabKey).ladyId || "");
  const session = ladies.get(id);
  if (!session) return { ok: false, error: "No active lady" };

  const name = firstName(session.anketa.displayName);
  const prevKey = activeTabKey;
  const reused = Boolean(session.home);

  if (!silent) {
    setWorkspaceLoading(true, `Opening ${name} · Home`);
    pushWorkspace();
  }

  if (!session.home) {
    const home = makeView(session.partition);
    session.home = home;
    try {
      await home.webContents.loadURL(`${GOLDEN_HOST}/lady`);
      await sleep(450);
    } catch (e) {
      session.home = null;
      try {
        home.webContents.destroy();
      } catch (_) {}
      if (!silent) {
        setWorkspaceLoading(false);
        await sleep(320);
        if (prevKey) selectTab(prevKey);
        else selectTab(tabKey(id, "chat"));
      }
      return { ok: false, error: e.message || "Failed to open home" };
    }
  } else if (!silent) {
    await sleep(280);
  }

  if (!silent) {
    setWorkspaceLoading(false);
    await sleep(340);
    selectTab(tabKey(id, "home"));
  } else {
    pushWorkspace();
  }
  return { ok: true, reused };
}

async function openHomeForActive() {
  const { ladyId } = parseTabKey(activeTabKey);
  return openHomeForLady(ladyId);
}

async function closeTab(key) {
  const { ladyId, page } = parseTabKey(key);
  const session = ladies.get(ladyId);
  if (!session) return { ok: true, remaining: ladies.size };

  // Closing home tab only — keep chat.
  if (page === "home" && session.home) {
    if (workWindow && !workWindow.isDestroyed()) {
      try {
        workWindow.removeBrowserView(session.home);
      } catch (_) {}
    }
    try {
      session.home.webContents.destroy();
    } catch (_) {}
    session.home = null;
    if (activeTabKey === tabKey(ladyId, "home")) {
      selectTab(tabKey(ladyId, "chat"));
    } else {
      pushWorkspace();
    }
    return { ok: true, remaining: ladies.size };
  }

  stopPresence(ladyId);

  if (workWindow && !workWindow.isDestroyed()) {
    for (const view of [session.chat, session.home]) {
      if (!view) continue;
      try {
        workWindow.removeBrowserView(view);
      } catch (_) {}
    }
  }
  for (const view of [session.chat, session.home]) {
    if (!view) continue;
    try {
      view.webContents.destroy();
    } catch (_) {}
  }
  ladies.delete(ladyId);

  if (activeTabKey && parseTabKey(activeTabKey).ladyId === ladyId) {
    activeTabKey = null;
  }

  if (ladies.size === 0) {
    if (workWindow && !workWindow.isDestroyed()) workWindow.close();
    else showPickerKeepingSessions();
    return { ok: true, remaining: 0 };
  }

  const nextId = [...ladies.keys()][0];
  selectTab(tabKey(nextId, "chat"));
  return { ok: true, remaining: ladies.size };
}

function destroyAllLadies() {
  for (const id of [...presenceTimers.keys()]) {
    const t = presenceTimers.get(id);
    if (t) clearInterval(t);
    presenceTimers.delete(id);
  }
  api.presenceClear().catch(() => {});
  for (const [, s] of ladies) {
    if (workWindow && !workWindow.isDestroyed()) {
      for (const view of [s.chat, s.home]) {
        if (!view) continue;
        try {
          workWindow.removeBrowserView(view);
        } catch (_) {}
      }
    }
    for (const view of [s.chat, s.home]) {
      if (!view) continue;
      try {
        view.webContents.destroy();
      } catch (_) {}
    }
  }
  ladies.clear();
  activeTabKey = null;
}

ipcMain.handle("auth:login", async (_e, { email, password, remember }) => {
  try {
    const data = await api.login(email, password);
    if (remember) {
      writeConfig({
        rememberLogin: true,
        savedEmail: String(email || "").trim(),
        savedPassword: String(password || ""),
      });
    } else {
      writeConfig({
        rememberLogin: false,
        savedEmail: null,
        savedPassword: null,
      });
    }
    return { ok: true, user: data.user };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("auth:saved-login", async () => {
  const cfg = readConfig();
  if (!cfg.rememberLogin) {
    return { ok: true, remember: false, email: "", password: "" };
  }
  return {
    ok: true,
    remember: true,
    email: String(cfg.savedEmail || ""),
    password: String(cfg.savedPassword || ""),
  };
});

ipcMain.handle("auth:logout", async () => {
  destroyAllLadies();
  await clearAllPresence();
  if (workWindow && !workWindow.isDestroyed()) {
    workWindow.removeAllListeners("closed");
    workWindow.destroy();
    workWindow = null;
  }
  api.logout();
  return { ok: true };
});

ipcMain.handle("auth:session", async () => {
  const cfg = readConfig();
  return {
    user: cfg.user || null,
    hasToken: !!cfg.token,
    openIds: [...ladies.keys()],
    hasOpenTabs: ladies.size > 0,
  };
});

ipcMain.handle("ankety:list", async () => {
  try {
    const data = await api.fetchMyAnkety();
    return { ok: true, openIds: [...ladies.keys()], ...data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("ankety:open-ids", async () => [...ladies.keys()]);

ipcMain.handle("anketa:open", async (_e, anketa) => {
  if (!anketa?.externalId || !anketa?.password) {
    return { ok: false, error: "Anketa missing ID or password" };
  }
  try {
    if (loginQueueBusy) {
      await new Promise((r) => setTimeout(r, LOGIN_STAGGER_MS));
    }
    loginQueueBusy = true;
    const result = await openLadySession(anketa, { silent: true });
    loginQueueBusy = false;
    showWorkWindow();
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    loginQueueBusy = false;
  }
});

/** Login selected ladies one-by-one; emit progress to the picker window. */
ipcMain.handle("anketa:open-batch", async (e, list) => {
  const items = Array.isArray(list) ? list.filter((a) => a?.externalId && a?.password) : [];
  if (!items.length) return { ok: false, error: "No questionnaires selected" };

  const toOpen = items.filter((a) => !ladies.has(String(a.externalId)));
  const skipped = items.length - toOpen.length;
  if (!toOpen.length) {
    for (const a of items) {
      await ensureHomeAfterChat(String(a.externalId), { silent: true });
    }
    showWorkWindow();
    return { ok: true, opened: 0, skipped, errors: [] };
  }

  loginQueueBusy = true;
  const errors = [];
  try {
    for (let i = 0; i < toOpen.length; i += 1) {
      const anketa = toOpen[i];
      const name = String(anketa.displayName || anketa.externalId);
      e.sender.send("anketa:batch-progress", {
        index: i + 1,
        total: toOpen.length,
        name,
        externalId: String(anketa.externalId),
        phase: "login",
        message: `Connecting chat: ${name}`,
      });
      try {
        await openLadySession(anketa, { silent: true });
        keepWorkWindowHidden();
        e.sender.send("anketa:batch-progress", {
          index: i + 1,
          total: toOpen.length,
          name,
          externalId: String(anketa.externalId),
          phase: "done",
          message: `Ready: ${name}`,
        });
      } catch (err) {
        const msg = err?.message || "Login failed";
        errors.push({ id: String(anketa.externalId), name, error: msg });
        e.sender.send("anketa:batch-progress", {
          index: i + 1,
          total: toOpen.length,
          name,
          externalId: String(anketa.externalId),
          phase: "error",
          message: `Failed: ${name}`,
          error: msg,
        });
      }
      if (i < toOpen.length - 1) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
  } finally {
    loginQueueBusy = false;
  }

  if (ladies.size > 0) {
    // Only now reveal Bracho workspace with ready chats.
    showWorkWindow();
    scheduleLayoutFix();
  }
  return {
    ok: errors.length < toOpen.length,
    opened: toOpen.length - errors.length,
    skipped,
    errors,
  };
});

ipcMain.handle("config:apiBase", async () => apiBase());
ipcMain.handle("config:setApiBase", async (_e, url) => {
  writeConfig({ apiBase: String(url || "").replace(/\/$/, "") });
  return { ok: true, apiBase: apiBase() };
});

ipcMain.handle("workspace:reload-tab", async () => {
  if (!activeTabKey) return { ok: false, error: "No tab" };
  const { ladyId, page } = parseTabKey(activeTabKey);
  const session = ladies.get(ladyId);
  if (!session) return { ok: false, error: "No session" };
  const view = page === "home" ? session.home : session.chat;
  if (!view || view.webContents.isDestroyed()) {
    return { ok: false, error: "No page" };
  }
  view.webContents.reload();
  return { ok: true };
});

ipcMain.handle("workspace:zoom", async (_e, delta) => {
  const step = Number(delta);
  const next = setGoldenZoom(goldenZoom + (Number.isFinite(step) ? step : 0));
  if (workWindow && !workWindow.isDestroyed()) {
    workWindow.webContents.send("workspace:zoom", { zoom: next });
  }
  return { ok: true, zoom: next };
});

ipcMain.handle("workspace:zoom-set", async (_e, value) => {
  const next = setGoldenZoom(value == null ? 1 : value);
  if (workWindow && !workWindow.isDestroyed()) {
    workWindow.webContents.send("workspace:zoom", { zoom: next });
  }
  return { ok: true, zoom: next };
});

ipcMain.handle("workspace:state", async () => workspaceSnapshot());
ipcMain.handle("workspace:select-tab", async (_e, payload) => {
  const key = typeof payload === "string" ? payload : String(payload?.key || "");
  const focus = !(payload && typeof payload === "object" && payload.focus === false);
  const ok = selectTab(key);
  if (ok && focus) showWorkWindow();
  return { ok };
});
ipcMain.handle("workspace:close-tab", async (_e, key) => closeTab(String(key)));
ipcMain.handle("workspace:open-home", async () => openHomeForActive());
ipcMain.handle("workspace:add-lady", async () => {
  showPickerKeepingSessions();
  return { ok: true };
});
ipcMain.handle("workspace:exit", async () => {
  if (activeTabKey) return closeTab(activeTabKey);
  showPickerKeepingSessions();
  return { ok: true, remaining: ladies.size };
});
ipcMain.handle("workspace:back-to-chats", async () => {
  if (ladies.size === 0) return { ok: false, error: "No open chats" };
  showWorkWindow();
  return { ok: true };
});

// Compat aliases
ipcMain.handle("workspace:select-lady", async (_e, id) => {
  const ok = selectTab(tabKey(String(id), "chat"));
  if (ok) showWorkWindow();
  return { ok };
});
ipcMain.handle("workspace:close-lady", async (_e, id) =>
  closeTab(tabKey(String(id), "chat")),
);
ipcMain.handle("workspace:tabs", async () => workspaceSnapshot().tabs);
ipcMain.handle("workspace:select", async (_e, key) => {
  const ok = selectTab(String(key));
  if (ok) showWorkWindow();
  return { ok };
});

app.setAppUserModelId("com.bracho.program");

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  initGoldenZoom();
  createAuthWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createAuthWindow();
});
