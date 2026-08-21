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
const { highlightMarkedIdsScript } = require("./lib/golden-highlighter");
const {
  viewerCollectInstallScript,
  viewerCollectDrainScript,
} = require("./lib/golden-viewer-collect");
const {
  collectOnlineManIdsScript,
  gwtCaptureInstallScript,
  visitManProfileScript,
} = require("./lib/golden-profile-visit");
const { visitToggleInstallScript } = require("./lib/golden-visit-toggle");
const { translateText, getTranslatorSettings, normalizeReadTarget } = require("./lib/translate");
const {
  getSelectionForTranslateScript,
  applyWriteTranslationScript,
  showTranslatePopupScript,
} = require("./lib/golden-translator-ui");
const { globalSyncAutofillScript } = require("./lib/global-sync");

const GOLDEN_HOST = "https://goldenbride.net";
const GLOBAL_SYNC_URL = "https://global-sync.org/login";
const GLOBAL_SYNC_PARTITION = "persist:bracho-global-sync";
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
/** Single shared Global Sync BrowserWindow (all operators ladies share one). */
let globalSyncWindow = null;
let globalSyncAutofillDone = false;
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
const GOLDMAN_REFRESH_MS = 90_000;
const VIEWER_COLLECT_MS = 8_000;
const PROFILE_VISIT_INTERVAL_MS = 6_000;
const PROFILE_VISIT_LOOP_MS = 10_000;

let goldmanIdsCache = { ids: [], fetchedAt: 0 };
let goldmanRefreshTimer = null;
let viewerCollectTimer = null;
/** IDs already pushed this session (avoid re-POSTing known skips every tick). */
const viewerPushedIds = new Set();
/**
 * ladyId → profile visit job
 * @type {Map<string, {
 *   running: boolean,
 *   mode: 'online' | 'loop',
 *   queue: string[],
 *   index: number,
 *   visitsDone: number,
 *   intervalMs: number,
 *   timer: NodeJS.Timeout | null,
 *   stopRequested: boolean,
 *   lastError: string,
 * }>}
 */
const profileVisitJobs = new Map();

async function getGoldmanManIds(force = false) {
  const age = Date.now() - goldmanIdsCache.fetchedAt;
  if (!force && goldmanIdsCache.fetchedAt && age < 20_000) {
    return goldmanIdsCache.ids;
  }
  const ids = await api.fetchGoldmanManIds();
  goldmanIdsCache = { ids, fetchedAt: Date.now() };
  return ids;
}

async function applyGoldmanHighlights(view) {
  if (!view || view.webContents.isDestroyed()) return;
  try {
    const url = view.webContents.getURL() || "";
    if (!/\/chat/i.test(url)) return;
  } catch (_) {
    return;
  }
  try {
    const ids = await getGoldmanManIds(false);
    if (!ids.length) {
      console.warn("[bracho] Goldman Agency list empty or API failed");
    } else {
      console.log("[bracho] Goldman coins for", ids.length, "ids");
    }
    await view.webContents.executeJavaScript(highlightMarkedIdsScript(ids), true);
  } catch (e) {
    console.warn("[bracho] applyGoldmanHighlights failed", e?.message || e);
  }
}

async function refreshGoldmanHighlightsAll(force = false) {
  try {
    await getGoldmanManIds(force);
  } catch (_) {}
  for (const s of ladies.values()) {
    await applyGoldmanHighlights(s.chat);
  }
}

function startGoldmanRefreshLoop() {
  if (goldmanRefreshTimer) return;
  goldmanRefreshTimer = setInterval(() => {
    refreshGoldmanHighlightsAll(true).catch(() => {});
  }, GOLDMAN_REFRESH_MS);
}

async function installViewerCollect(view) {
  if (!view || view.webContents.isDestroyed()) return;
  try {
    const url = view.webContents.getURL() || "";
    if (!/\/lady/i.test(url)) return;
  } catch (_) {
    return;
  }
  try {
    await view.webContents.executeJavaScript(viewerCollectInstallScript(), true);
  } catch (e) {
    console.warn("[bracho] viewer collect install failed", e?.message || e);
  }
}

async function harvestViewerPayeesFromHomes() {
  const found = [];
  for (const s of ladies.values()) {
    const home = s.home;
    if (!home || home.webContents.isDestroyed()) continue;
    try {
      const url = home.webContents.getURL() || "";
      if (!/\/lady/i.test(url)) continue;
    } catch (_) {
      continue;
    }
    try {
      await home.webContents.executeJavaScript(viewerCollectInstallScript(), true);
      const ids = await home.webContents.executeJavaScript(
        viewerCollectDrainScript(),
        true,
      );
      if (Array.isArray(ids)) {
        for (const id of ids) {
          const sId = String(id || "").trim();
          if (/^\d{3,12}$/.test(sId)) found.push(sId);
        }
      }
    } catch (e) {
      console.warn("[bracho] viewer harvest failed", e?.message || e);
    }
  }
  return [...new Set(found)];
}

async function syncViewerPayeesToGoldman() {
  const found = await harvestViewerPayeesFromHomes();
  const fresh = found.filter((id) => !viewerPushedIds.has(id));
  if (!fresh.length) return;
  for (const id of fresh) viewerPushedIds.add(id);
  const result = await api.pushGoldmanViewerIds(fresh);
  if (result.ok && result.added > 0) {
    console.log(
      "[bracho] Goldman viewer payees added:",
      result.added,
      "skipped:",
      result.skipped,
    );
    // Refresh chat coins so new IDs get badges soon.
    refreshGoldmanHighlightsAll(true).catch(() => {});
  } else if (result.ok && result.skipped > 0) {
    console.log("[bracho] Goldman viewer payees already known:", result.skipped);
  }
}

function startViewerCollectLoop() {
  if (viewerCollectTimer) return;
  viewerCollectTimer = setInterval(() => {
    syncViewerPayeesToGoldman().catch(() => {});
  }, VIEWER_COLLECT_MS);
}

function profileVisitStatus(ladyId) {
  const job = profileVisitJobs.get(String(ladyId || ""));
  if (!job) {
    return {
      running: false,
      mode: "",
      index: 0,
      total: 0,
      manId: "",
      lastError: "",
    };
  }
  return {
    running: Boolean(job.running),
    mode: job.mode || "online",
    index: job.mode === "loop" ? job.visitsDone : job.index,
    total: job.mode === "loop" ? 0 : job.queue.length,
    manId: job.mode === "loop" ? String(job.queue[0] || "") : "",
    lastError: job.lastError || "",
  };
}

function ladyIdFromWebContents(wc) {
  if (!wc) return null;
  for (const [id, s] of ladies) {
    try {
      if (s.chat && !s.chat.webContents.isDestroyed() && s.chat.webContents.id === wc.id) {
        return id;
      }
      if (s.home && !s.home.webContents.isDestroyed() && s.home.webContents.id === wc.id) {
        return id;
      }
    } catch (_) {}
  }
  return null;
}

function pushProfileVisitState(ladyId) {
  const id = String(ladyId || "");
  const status = profileVisitStatus(id);
  const session = ladies.get(id);
  if (session?.chat && !session.chat.webContents.isDestroyed()) {
    try {
      session.chat.webContents.send("bracho:profile-visit-state", status);
    } catch (_) {}
    try {
      session.chat.webContents
        .executeJavaScript(
          `typeof window.__brachoVisitSetState==='function'&&window.__brachoVisitSetState(${JSON.stringify(status)});`,
          true,
        )
        .catch(() => {});
    } catch (_) {}
  }
  pushWorkspace();
}

async function installVisitToggle(view, ladyId) {
  if (!view || view.webContents.isDestroyed()) return;
  try {
    const url = view.webContents.getURL() || "";
    if (!/\/chat/i.test(url)) return;
  } catch (_) {
    return;
  }
  const status = profileVisitStatus(ladyId || ladyIdFromWebContents(view.webContents) || "");
  try {
    const res = await view.webContents.executeJavaScript(
      visitToggleInstallScript(status.running),
      true,
    );
    console.log("[bracho] visit toggle installed", res);
  } catch (e) {
    console.warn("[bracho] visit toggle install", e?.message || e);
  }
}

function clearProfileVisitTimer(job) {
  if (job?.timer) {
    clearTimeout(job.timer);
    job.timer = null;
  }
}

async function stopProfileVisits(ladyId) {
  const id = String(ladyId || "");
  const job = profileVisitJobs.get(id);
  if (!job) return { ok: true, ...profileVisitStatus(id) };
  job.stopRequested = true;
  clearProfileVisitTimer(job);
  job.running = false;
  pushProfileVisitState(id);
  return { ok: true, ...profileVisitStatus(id) };
}

async function runNextProfileVisit(ladyId) {
  const id = String(ladyId);
  const job = profileVisitJobs.get(id);
  const session = ladies.get(id);
  if (!job || !session) return;
  if (job.stopRequested) {
    job.running = false;
    clearProfileVisitTimer(job);
    pushProfileVisitState(id);
    return;
  }

  const isLoop = job.mode === "loop";
  if (!isLoop && job.index >= job.queue.length) {
    job.running = false;
    clearProfileVisitTimer(job);
    console.log("[bracho] profile visits done for", id, "total", job.queue.length);
    pushProfileVisitState(id);
    return;
  }

  const manId = isLoop ? job.queue[0] : job.queue[job.index];
  if (!manId) {
    job.running = false;
    clearProfileVisitTimer(job);
    pushProfileVisitState(id);
    return;
  }

  if (isLoop) job.visitsDone += 1;
  else job.index += 1;
  pushProfileVisitState(id);

  const chat = session.chat;
  if (!chat || chat.webContents.isDestroyed()) {
    job.lastError = "Chat not open";
    job.running = false;
    pushProfileVisitState(id);
    return;
  }

  try {
    // Best-effort: refresh GWT tokens from Home if it is already open (no navigation).
    if (session.home && !session.home.webContents.isDestroyed()) {
      session.home.webContents
        .executeJavaScript(gwtCaptureInstallScript(), true)
        .catch(() => {});
    }
    await chat.webContents.executeJavaScript(gwtCaptureInstallScript(), true);
    const res = await chat.webContents.executeJavaScript(
      visitManProfileScript(manId),
      true,
    );
    if (!res || !res.ok) {
      job.lastError = String(res?.error || "visit rpc failed");
      console.warn("[bracho] profile visit rpc failed", manId, job.lastError);
    } else {
      job.lastError = "";
      if (isLoop) {
        console.log("[bracho] profile visit rpc loop", job.visitsDone, manId);
      } else {
        console.log(
          "[bracho] profile visit rpc",
          job.index,
          "/",
          job.queue.length,
          manId,
        );
      }
    }
  } catch (e) {
    job.lastError = e?.message || String(e);
    console.warn("[bracho] profile visit rpc error", manId, job.lastError);
  }

  if (job.stopRequested) {
    job.running = false;
    clearProfileVisitTimer(job);
    pushProfileVisitState(id);
    return;
  }

  const waitMs = Number(job.intervalMs) || PROFILE_VISIT_INTERVAL_MS;
  clearProfileVisitTimer(job);
  job.timer = setTimeout(() => {
    runNextProfileVisit(id).catch((e) => {
      console.warn("[bracho] profile visit loop", e?.message || e);
    });
  }, waitMs);
}

async function startProfileVisitsForActive() {
  const { ladyId } = parseTabKey(activeTabKey);
  const id = String(ladyId || "");
  const session = ladies.get(id);
  if (!session) return { ok: false, error: "No active lady" };

  const existing = profileVisitJobs.get(id);
  if (existing?.running) {
    return { ok: false, error: "Already running", ...profileVisitStatus(id) };
  }

  if (!session.chat || session.chat.webContents.isDestroyed()) {
    return { ok: false, error: "Chat not open" };
  }

  let online;
  try {
    online = await session.chat.webContents.executeJavaScript(
      collectOnlineManIdsScript(),
      true,
    );
  } catch (e) {
    return { ok: false, error: e?.message || "Failed to read online list" };
  }
  const queue = Array.isArray(online?.ids)
    ? [...new Set(online.ids.map((x) => String(x).trim()).filter((x) => /^\d{3,12}$/.test(x)))]
    : [];
  if (!queue.length) {
    return { ok: false, error: "No men online right now" };
  }

  const job = {
    running: true,
    mode: "online",
    queue,
    index: 0,
    visitsDone: 0,
    intervalMs: PROFILE_VISIT_INTERVAL_MS,
    timer: null,
    stopRequested: false,
    lastError: "",
  };
  profileVisitJobs.set(id, job);
  pushProfileVisitState(id);
  console.log("[bracho] profile visit rpc start", id, "count", queue.length);
  runNextProfileVisit(id).catch((e) => {
    console.warn("[bracho] profile visits start failed", e?.message || e);
  });
  return { ok: true, ...profileVisitStatus(id) };
}

async function startProfileVisitLoopForActive(rawManId) {
  const { ladyId } = parseTabKey(activeTabKey);
  const id = String(ladyId || "");
  const session = ladies.get(id);
  if (!session) return { ok: false, error: "No active lady" };

  const manId = String(rawManId || "").replace(/\D/g, "");
  if (!/^\d{3,12}$/.test(manId)) {
    return { ok: false, error: "Enter a valid man ID" };
  }

  const existing = profileVisitJobs.get(id);
  if (existing?.running) {
    return { ok: false, error: "Already running — stop first", ...profileVisitStatus(id) };
  }

  if (!session.chat || session.chat.webContents.isDestroyed()) {
    return { ok: false, error: "Chat not open" };
  }

  const job = {
    running: true,
    mode: "loop",
    queue: [manId],
    index: 0,
    visitsDone: 0,
    intervalMs: PROFILE_VISIT_LOOP_MS,
    timer: null,
    stopRequested: false,
    lastError: "",
  };
  profileVisitJobs.set(id, job);
  pushProfileVisitState(id);
  console.log("[bracho] profile visit rpc loop start", id, manId, "every", PROFILE_VISIT_LOOP_MS, "ms");
  runNextProfileVisit(id).catch((e) => {
    console.warn("[bracho] profile visit loop start failed", e?.message || e);
  });
  return { ok: true, ...profileVisitStatus(id) };
}

async function toggleProfileVisitsForLady(ladyId) {
  const id = String(ladyId || "");
  if (!id || !ladies.has(id)) return { ok: false, error: "No active lady" };
  const job = profileVisitJobs.get(id);
  if (job?.running) {
    if (job.mode === "loop") {
      return stopProfileVisits(id);
    }
    return stopProfileVisits(id);
  }
  // Temporarily set active tab context for startProfileVisitsForActive helpers
  const prev = activeTabKey;
  activeTabKey = tabKey(id, "chat");
  try {
    return await startProfileVisitsForActive();
  } finally {
    activeTabKey = prev;
  }
}

async function toggleProfileVisitsForActive() {
  const { ladyId } = parseTabKey(activeTabKey);
  return toggleProfileVisitsForLady(ladyId);
}

async function toggleProfileVisitLoopForActive(rawManId) {
  const { ladyId } = parseTabKey(activeTabKey);
  const id = String(ladyId || "");
  const job = profileVisitJobs.get(id);
  if (job?.running) {
    if (job.mode === "loop") {
      return stopProfileVisits(id);
    }
    return { ok: false, error: "Visit online is running — stop it first" };
  }
  return startProfileVisitLoopForActive(rawManId);
}

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

function getGlobalSyncSettings() {
  const cfg = readConfig();
  return {
    login: String(cfg.globalSyncLogin || "").trim(),
    password: String(cfg.globalSyncPassword || ""),
  };
}

/** Prefer director-set credentials from API; cache locally for offline autofill. */
async function resolveGlobalSyncCredentials() {
  try {
    const data = await api.fetchMyAnkety();
    const login = String(data?.operator?.globalSyncLogin || "").trim();
    const password = String(data?.operator?.globalSyncPassword || "");
    try {
      writeConfig({ globalSyncLogin: login, globalSyncPassword: password });
    } catch (_) {}
    return { login, password };
  } catch (e) {
    console.warn(
      "[bracho] global-sync credentials from API",
      e?.message || e,
    );
    return getGlobalSyncSettings();
  }
}

async function tryGlobalSyncAutofill(wc) {
  if (!wc || wc.isDestroyed()) return;
  const { login, password } = await resolveGlobalSyncCredentials();
  if (!login || !password) {
    console.warn("[bracho] global-sync: no credentials (set in Account Manager)");
    return;
  }
  try {
    const href = wc.getURL() || "";
    if (!/global-sync\.org/i.test(href)) return;
  } catch (_) {
    return;
  }
  try {
    const res = await wc.executeJavaScript(
      globalSyncAutofillScript(login, password),
      true,
    );
    console.log("[bracho] global-sync autofill", res);
    if (res?.ok && (res.submitted || res.skipped)) globalSyncAutofillDone = true;
  } catch (e) {
    console.warn("[bracho] global-sync autofill", e?.message || e);
  }
}

function openGlobalSyncWindow() {
  // Refresh director-set credentials before autofill.
  resolveGlobalSyncCredentials().catch(() => {});

  if (globalSyncWindow && !globalSyncWindow.isDestroyed()) {
    if (globalSyncWindow.isMinimized()) globalSyncWindow.restore();
    globalSyncWindow.show();
    globalSyncWindow.focus();
    globalSyncAutofillDone = false;
    try {
      const wc = globalSyncWindow.webContents;
      setTimeout(() => tryGlobalSyncAutofill(wc).catch(() => {}), 400);
    } catch (_) {}
    return { ok: true, reused: true };
  }

  globalSyncAutofillDone = false;
  const size = largeBounds();
  globalSyncWindow = new BrowserWindow({
    width: Math.min(1280, size.width),
    height: Math.min(860, size.height),
    minWidth: 900,
    minHeight: 600,
    title: "Global Sync",
    icon: appIcon(),
    backgroundColor: "#0b0f14",
    show: true,
    webPreferences: {
      partition: GLOBAL_SYNC_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  globalSyncWindow.on("closed", () => {
    globalSyncWindow = null;
    globalSyncAutofillDone = false;
  });

  const wc = globalSyncWindow.webContents;
  wc.setWindowOpenHandler(() => ({ action: "deny" }));

  const scheduleAutofill = () => {
    if (globalSyncAutofillDone) return;
    setTimeout(() => tryGlobalSyncAutofill(wc).catch(() => {}), 600);
    setTimeout(() => tryGlobalSyncAutofill(wc).catch(() => {}), 1800);
    setTimeout(() => tryGlobalSyncAutofill(wc).catch(() => {}), 3500);
  };

  wc.on("did-finish-load", scheduleAutofill);
  wc.on("did-navigate", scheduleAutofill);
  wc.on("did-navigate-in-page", scheduleAutofill);

  globalSyncWindow.loadURL(GLOBAL_SYNC_URL).catch((e) => {
    console.warn("[bracho] global-sync load", e?.message || e);
  });

  return { ok: true, reused: false };
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
  const visitJob = activeLadyId ? profileVisitJobs.get(activeLadyId) : null;
  return {
    tabs,
    openIds: [...ladies.keys()],
    activeTabKey,
    activeLadyId,
    zoom: goldenZoom,
    profileVisit: visitJob
      ? {
          running: Boolean(visitJob.running),
          mode: visitJob.mode || "online",
          index: visitJob.mode === "loop" ? visitJob.visitsDone : visitJob.index,
          total: visitJob.mode === "loop" ? 0 : visitJob.queue.length,
          manId: visitJob.mode === "loop" ? String(visitJob.queue[0] || "") : "",
          lastError: visitJob.lastError || "",
        }
      : {
          running: false,
          mode: "",
          index: 0,
          total: 0,
          manId: "",
          lastError: "",
        },
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
  if (wc.__brachoInputHooks) return;
  wc.__brachoInputHooks = true;
  wc.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const key = String(input.key || "").toLowerCase();
    if (key === "f5") {
      event.preventDefault();
      return;
    }
    if ((input.control || input.meta) && (key === "r" || key === "f5")) {
      event.preventDefault();
      return;
    }
    // Ctrl+Space — translator
    if ((input.control || input.meta) && !input.alt && !input.shift && key === " ") {
      event.preventDefault();
      runTranslatorHotkey(wc).catch((e) => {
        console.warn("[bracho] translator hotkey", e?.message || e);
      });
    }
  });
}

async function runTranslatorHotkey(wc) {
  if (!wc || wc.isDestroyed()) return;
  let sel;
  try {
    sel = await wc.executeJavaScript(getSelectionForTranslateScript(), true);
  } catch (e) {
    return;
  }
  const text = String(sel?.text || "").trim();
  if (!text) {
    await wc
      .executeJavaScript(
        showTranslatePopupScript({
          error:
            sel?.mode === "write"
              ? "Type text in the field first"
              : "Select text first",
          rect: sel?.rect,
        }),
        true,
      )
      .catch(() => {});
    return;
  }

  const mode = sel?.mode === "write" ? "write" : "read";
  try {
    const result = await translateText({ text, mode });
    if (mode === "write") {
      const applied = await wc.executeJavaScript(
        applyWriteTranslationScript(result.translated),
        true,
      );
      if (!applied?.ok) {
        await wc.executeJavaScript(
          showTranslatePopupScript({
            translated: result.translated,
            provider: result.provider,
            rect: sel.rect,
          }),
          true,
        );
      }
      return;
    }
    await wc.executeJavaScript(
      showTranslatePopupScript({
        translated: result.translated,
        provider: result.provider,
        rect: sel.rect,
      }),
      true,
    );
  } catch (e) {
    await wc
      .executeJavaScript(
        showTranslatePopupScript({
          error: e?.message || String(e),
          rect: sel?.rect,
        }),
        true,
      )
      .catch(() => {});
  }
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
  if (page === "chat") {
    applyGoldmanHighlights(view).catch(() => {});
    installVisitToggle(view, ladyId).catch(() => {});
  }
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

/** Hunspell for chat inputs — RU + UK (operators draft before EN translate). */
function ensureSpellChecker(partition) {
  const ses = session.fromPartition(partition);
  // Always re-apply languages (partition may outlive code changes).
  try {
    ses.setSpellCheckerEnabled(true);
  } catch (_) {}
  try {
    const available = ses.availableSpellCheckerLanguages || [];
    const preferred = ["ru", "uk"].filter((code) => available.includes(code));
    if (preferred.length) {
      ses.setSpellCheckerLanguages(preferred);
    } else if (available.includes("ru-RU")) {
      ses.setSpellCheckerLanguages(["ru-RU"]);
    } else {
      // Last resort — still prefer Slavic codes if Chromium names them differently.
      const fallback = available.filter((c) => /^(ru|uk)/i.test(c)).slice(0, 2);
      if (fallback.length) ses.setSpellCheckerLanguages(fallback);
      else console.warn("[bracho] no RU/UK spell dictionaries installed", available.slice(0, 30));
    }
    console.log(
      "[bracho] spellchecker languages",
      typeof ses.getSpellCheckerLanguages === "function"
        ? ses.getSpellCheckerLanguages()
        : preferred,
      "available sample:",
      available.slice(0, 30),
    );
  } catch (e) {
    console.warn("[bracho] spellchecker languages", e?.message || e);
  }
  ses.__brachoSpellOk = true;
}

/**
 * Right-click menu in Golden pages:
 * - LanguageTool spelling suggestions (Edge-like quality for RU/UK)
 * - Cut / Copy / Paste / Select All in editable fields
 */
function attachEditableContextMenu(wc) {
  if (!wc || wc.isDestroyed() || wc.__brachoCtxMenu) return;
  wc.__brachoCtxMenu = true;
  const { getSmartSpellSuggestions } = require("./lib/spellcheck-lt");

  wc.on("context-menu", (_event, params) => {
    void (async () => {
      if (wc.isDestroyed()) return;

      const items = [];
      let smart = { word: "", suggestions: [] };
      try {
        if (params.isEditable || params.misspelledWord || params.selectionText) {
          smart = await getSmartSpellSuggestions(params);
        }
      } catch (_) {}

      const misspelled = String(params.misspelledWord || smart.word || "").trim();
      const suggestions = smart.suggestions || [];

      if (misspelled && suggestions.length) {
        for (const suggestion of suggestions.slice(0, 8)) {
          items.push({
            label: suggestion,
            click: () => {
              if (wc.isDestroyed()) return;
              try {
                if (params.misspelledWord) {
                  wc.replaceMisspelling(suggestion);
                } else {
                  wc.executeJavaScript(
                    `(() => {
                      const t = ${JSON.stringify(suggestion)};
                      const ae = document.activeElement;
                      if (ae && typeof ae.selectionStart === 'number') {
                        const start = ae.selectionStart;
                        const end = ae.selectionEnd;
                        const before = String(ae.value || '').slice(0, start);
                        const after = String(ae.value || '').slice(end);
                        const next = before + t + after;
                        const tag = String(ae.tagName || '').toUpperCase();
                        const proto = tag === 'TEXTAREA'
                          ? window.HTMLTextAreaElement.prototype
                          : window.HTMLInputElement.prototype;
                        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
                        if (desc && desc.set) desc.set.call(ae, next);
                        else ae.value = next;
                        const caret = start + t.length;
                        try { ae.setSelectionRange(caret, caret); } catch (e) {}
                        ae.dispatchEvent(new Event('input', { bubbles: true }));
                        ae.dispatchEvent(new Event('change', { bubbles: true }));
                        return true;
                      }
                      try { document.execCommand('insertText', false, t); return true; } catch (e) { return false; }
                    })();`,
                    true,
                  ).catch(() => {});
                }
              } catch (_) {}
            },
          });
        }
        if (params.misspelledWord) {
          items.push({
            label: "Add to dictionary",
            click: () => {
              try {
                wc.session.addWordToSpellCheckerDictionary(params.misspelledWord);
              } catch (_) {}
            },
          });
        }
        items.push({ type: "separator" });
      } else if (misspelled) {
        items.push({
          label: "No spelling suggestions (check internet)",
          enabled: false,
        });
        items.push({ type: "separator" });
      }

      const flags = params.editFlags || {};
      if (params.isEditable) {
        items.push(
          { role: "undo", enabled: Boolean(flags.canUndo) },
          { role: "redo", enabled: Boolean(flags.canRedo) },
          { type: "separator" },
          { role: "cut", enabled: Boolean(flags.canCut) },
          { role: "copy", enabled: Boolean(flags.canCopy) },
          { role: "paste", enabled: Boolean(flags.canPaste) },
          { type: "separator" },
          { role: "selectAll", enabled: Boolean(flags.canSelectAll) },
        );
      } else if (params.selectionText) {
        items.push({ role: "copy", enabled: Boolean(flags.canCopy) });
      }

      if (!items.length) return;

      const menu = Menu.buildFromTemplate(items);
      const win =
        BrowserWindow.fromWebContents(wc) ||
        (workWindow && !workWindow.isDestroyed() ? workWindow : null);
      try {
        menu.popup(win ? { window: win } : undefined);
      } catch (e) {
        console.warn("[bracho] context menu", e?.message || e);
      }
    })();
  });
}

function makeView(partition) {
  ensurePartitionMedia(partition);
  ensureSpellChecker(partition);
  const view = new BrowserView({
    webPreferences: {
      partition,
      preload: path.join(__dirname, "preload-golden.js"),
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      spellcheck: true,
    },
  });
  applyZoomToView(view);
  try {
    view.webContents.setBackgroundThrottling(false);
  } catch (_) {}
  blockReloadShortcuts(view.webContents);
  attachEditableContextMenu(view.webContents);
  view.webContents.on("did-finish-load", () => {
    applyZoomToView(view);
    view.webContents
      .executeJavaScript(hideBroadcastUiScript(), true)
      .catch(() => {});
    // Wait until chat UI mounts — avoid hammering DOM on first paint.
    setTimeout(() => {
      applyGoldmanHighlights(view).catch(() => {});
      installViewerCollect(view).catch(() => {});
      view.webContents
        .executeJavaScript(gwtCaptureInstallScript(), true)
        .catch(() => {});
      // Always try — do not gate on ladyId (map may lag first paint).
      installVisitToggle(view, ladyIdFromWebContents(view.webContents)).catch(() => {});
    }, 2500);
    // Chat UI mounts late — reinject toggle.
    setTimeout(() => {
      installVisitToggle(view, ladyIdFromWebContents(view.webContents)).catch(() => {});
    }, 6000);
    setTimeout(() => {
      installVisitToggle(view, ladyIdFromWebContents(view.webContents)).catch(() => {});
    }, 12000);
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
  await applyGoldmanHighlights(view);
  startGoldmanRefreshLoop();
  startViewerCollectLoop();
  const lid = ladyIdFromWebContents(view.webContents);
  if (lid) await installVisitToggle(view, lid);
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
  try {
    if (session.home) {
      await installViewerCollect(session.home);
      startViewerCollectLoop();
      syncViewerPayeesToGoldman().catch(() => {});
    }
  } catch (_) {}
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
    await stopProfileVisits(ladyId);
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
  await stopProfileVisits(ladyId);
  profileVisitJobs.delete(ladyId);

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
ipcMain.handle("bracho:profile-visit-toggle", async (e) => {
  const ladyId = ladyIdFromWebContents(e.sender);
  if (!ladyId) return { ok: false, error: "Unknown chat" };
  return toggleProfileVisitsForLady(ladyId);
});
ipcMain.handle("workspace:profile-visit-toggle", async () => toggleProfileVisitsForActive());
ipcMain.handle("workspace:profile-visit-loop", async (_e, manId) =>
  toggleProfileVisitLoopForActive(manId),
);
ipcMain.handle("workspace:profile-visit-stop", async () => {
  const { ladyId } = parseTabKey(activeTabKey);
  return stopProfileVisits(ladyId);
});
ipcMain.handle("translator:get-settings", async () => getTranslatorSettings());
ipcMain.handle("translator:save-settings", async (_e, payload) => {
  const body = payload || {};
  const provider = body.provider === "deepl" ? "deepl" : "google";
  writeConfig({
    translatorProvider: provider,
    googleTranslateApiKey: String(body.googleApiKey ?? "").trim(),
    deeplApiKey: String(body.deeplApiKey ?? "").trim(),
    translatorReadTarget: normalizeReadTarget(body.readTarget),
    translatorWriteTarget: String(body.writeTarget || "en").trim() || "en",
  });
  return { ok: true, ...getTranslatorSettings() };
});
ipcMain.handle("translator:settings-open", async () => {
  if (workWindow && !workWindow.isDestroyed()) {
    try {
      hideAllViews();
    } catch (_) {}
  }
  return getTranslatorSettings();
});
ipcMain.handle("workspace:open-global-sync", async () => openGlobalSyncWindow());
ipcMain.handle("translator:settings-close", async () => {
  layoutActiveView();
  bumpActivePageLayout();
  return { ok: true };
});
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
