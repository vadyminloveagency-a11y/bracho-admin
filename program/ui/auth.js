(() => {
  const AUTH_SUBMIT_LABEL = "Login";
  const AUTH_SUBMIT_BUSY_HTML =
    'Login<span class="loading-dots" aria-hidden="true"><span></span><span></span><span></span></span>';
  const UNIT = "BRACHO  ·  ";
  const PITCH = 104;
  const APPROX_UNIT_W = 120;

  const gate = document.getElementById("app-auth-gate");
  const form = document.getElementById("auth-form");
  const picker = document.getElementById("agency-profile-picker");
  const pickerList = document.getElementById("agency-profile-picker-list");
  const pickerError = document.getElementById("picker-error");
  const pickerLogin = document.getElementById("agency-profile-picker-login");
  const connecting = document.getElementById("app-connecting-overlay");
  const connectingLabel = document.getElementById("connecting-label");
  const connectingSub = document.getElementById("connecting-sub");
  const connectingLog = document.getElementById("connecting-log");

  const els = {
    email: document.getElementById("auth-email"),
    password: document.getElementById("auth-password"),
    remember: document.getElementById("auth-remember"),
    submitBtn: document.getElementById("auth-submit-btn"),
    togglePassword: document.getElementById("auth-toggle-password"),
    status: document.getElementById("auth-status"),
  };

  const patternHosts = [
    { hostId: "app-auth-gate", patternId: "app-auth-bg-pattern" },
    { hostId: "agency-profile-picker", patternId: "agency-profile-bg-pattern" },
    { hostId: "app-connecting-overlay", patternId: "app-connecting-bg-pattern" },
  ];

  /** @type {Map<string, object>} */
  let anketaById = new Map();
  /** @type {Set<string>} */
  let selectedIds = new Set();
  let openIds = new Set();
  let hasOpenTabs = false;
  let batchRunning = false;

  const pickerCancel = document.getElementById("agency-profile-picker-cancel");
  const pickerBack = document.getElementById("agency-profile-picker-back");

  function setHidden(el, hide) {
    if (!el) return;
    el.classList.toggle("is-hidden", !!hide);
    if (hide) el.setAttribute("hidden", "");
    else el.removeAttribute("hidden");
  }

  function setStatus(text, isError = false) {
    if (!els.status) return;
    els.status.textContent = text || "";
    els.status.classList.toggle("is-error", isError);
  }

  function setPickerError(text) {
    if (!pickerError) return;
    pickerError.textContent = text || "";
  }

  function setBusy(busy) {
    els.submitBtn.disabled = busy;
    els.email.disabled = busy;
    els.password.disabled = busy;
    if (els.remember) els.remember.disabled = busy;
    const busyRoot = gate?.querySelector(".app-auth-gate-inner") || gate;
    busyRoot?.classList.toggle("app-auth-gate-busy", busy);
    if (els.submitBtn) {
      els.submitBtn.classList.toggle("is-busy", busy);
      els.submitBtn.setAttribute("aria-busy", busy ? "true" : "false");
      if (busy) els.submitBtn.innerHTML = AUTH_SUBMIT_BUSY_HTML;
      else els.submitBtn.textContent = AUTH_SUBMIT_LABEL;
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function initials(name) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2);
    return (parts[0][0] + parts[1][0]).slice(0, 2);
  }

  function ensurePatternLayer(hostId, patternId) {
    const host = document.getElementById(hostId);
    if (!host) return null;
    let layer = document.getElementById(patternId);
    if (!layer) {
      layer = document.createElement("div");
      layer.id = patternId;
      layer.className = "auth-bg-pattern";
      layer.setAttribute("aria-hidden", "true");
      host.insertBefore(layer, host.firstChild);
    }
    return layer;
  }

  function buildTrack(cover, lineText, rows) {
    const track = document.createElement("div");
    track.className = "auth-bg-pattern-track";
    track.style.width = `${cover}px`;
    track.style.rowGap = `${PITCH}px`;
    for (let i = 0; i < rows; i += 1) {
      const line = document.createElement("div");
      line.className = "auth-bg-line";
      line.textContent = lineText;
      line.style.animationDuration = `${64 + (i % 6) * 6}s`;
      track.appendChild(line);
    }
    return track;
  }

  function buildAuthWatermark({ force = false } = {}) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cover = Math.hypot(w, h) * 1.3;
    const rows = Math.ceil(cover / PITCH) + 3;
    const reps = Math.ceil(cover / APPROX_UNIT_W) + 2;
    const half = UNIT.repeat(reps);
    const lineText = half + half;
    const key = `${Math.round(w)}x${Math.round(h)}`;

    for (const { hostId, patternId } of patternHosts) {
      const layer = ensurePatternLayer(hostId, patternId);
      if (!layer) continue;
      const hasTrack = Boolean(layer.querySelector(".auth-bg-pattern-track"));
      if (!force && hasTrack && layer.dataset.wmKey === key) continue;
      layer.replaceChildren(buildTrack(cover, lineText, rows));
      layer.dataset.wmKey = key;
    }
  }

  function syncPickerActions() {
    setHidden(pickerCancel, hasOpenTabs);
    setHidden(pickerBack, !hasOpenTabs);
    updateLoginSelectedBtn();
  }

  function selectableCount() {
    let n = 0;
    for (const id of selectedIds) {
      if (!openIds.has(id)) n += 1;
    }
    return n;
  }

  function updateLoginSelectedBtn() {
    if (!pickerLogin) return;
    const n = selectableCount();
    pickerLogin.disabled = batchRunning || n === 0;
    pickerLogin.textContent =
      n <= 0 ? "Login selected" : n === 1 ? "Login 1 lady" : `Login ${n} ladies`;
  }

  function showLogin() {
    setHidden(picker, true);
    setHidden(connecting, true);
    setHidden(gate, false);
    setBusy(false);
    setStatus("");
    setPickerError("");
    openIds = new Set();
    selectedIds = new Set();
    hasOpenTabs = false;
    buildAuthWatermark();
    fillSavedLogin();
  }

  async function fillSavedLogin() {
    try {
      const saved = await window.bracho.getSavedLogin();
      if (!saved?.ok) return;
      if (els.remember) els.remember.checked = Boolean(saved.remember);
      if (saved.remember) {
        if (els.email) els.email.value = saved.email || "";
        if (els.password) els.password.value = saved.password || "";
      } else if (els.password) {
        els.password.value = "";
      }
    } catch (_) {
      if (els.password) els.password.value = "";
    }
  }

  function showPicker(meta = {}) {
    if (Array.isArray(meta.openIds)) openIds = new Set(meta.openIds.map(String));
    if (typeof meta.hasOpenTabs === "boolean") hasOpenTabs = meta.hasOpenTabs;
    else hasOpenTabs = openIds.size > 0;
    setHidden(gate, true);
    setHidden(connecting, true);
    setHidden(picker, false);
    setPickerError("");
    syncPickerActions();
    buildAuthWatermark({ force: true });
  }

  function showConnecting(title, sub) {
    if (connectingLabel) {
      connectingLabel.innerHTML =
        escapeHtml(title || "Login to the lady") +
        '<span class="loading-dots" aria-hidden="true"><span></span><span></span><span></span></span>';
    }
    if (connectingSub) connectingSub.textContent = sub || "";
    setHidden(connecting, false);
    buildAuthWatermark({ force: true });
  }

  function resetConnectingLog() {
    if (connectingLog) connectingLog.innerHTML = "";
  }

  /** One status line per lady — update in place, no duplicates. */
  function upsertConnectingLog(id, text, phase) {
    if (!connectingLog) return;
    const key = String(id || text);
    let li = connectingLog.querySelector(`[data-lady="${CSS.escape(key)}"]`);
    if (!li) {
      li = document.createElement("li");
      li.dataset.lady = key;
      connectingLog.appendChild(li);
    }
    li.className = "app-connecting-log-item" + (phase ? ` is-${phase}` : "");
    li.textContent = text;
    connectingLog.scrollTop = connectingLog.scrollHeight;
  }

  function firstName(displayName) {
    return String(displayName || "Lady").trim().split(/\s+/)[0] || "Lady";
  }

  function toggleSelect(id, alreadyOpen) {
    if (alreadyOpen || batchRunning) return;
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    const row = pickerList.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (row) {
      row.classList.toggle("is-selected", selectedIds.has(id));
      const mark = row.querySelector(".agency-profile-picker-check");
      if (mark) mark.classList.toggle("is-on", selectedIds.has(id));
    }
    updateLoginSelectedBtn();
  }

  async function loadLadies() {
    setPickerError("");
    selectedIds = new Set();
    updateLoginSelectedBtn();
    pickerList.innerHTML =
      '<p class="agency-profile-picker-meta" style="text-align:center;padding:12px 0">Loading…</p>';
    const res = await window.bracho.getAnkety();
    if (!res.ok) {
      pickerList.innerHTML = "";
      setPickerError(res.error || "Failed to load");
      return;
    }
    openIds = new Set((res.openIds || []).map(String));
    hasOpenTabs = openIds.size > 0;
    syncPickerActions();

    const list = res.ankety || [];
    anketaById = new Map(list.map((a) => [String(a.externalId), a]));
    if (!list.length) {
      pickerList.innerHTML =
        '<p class="agency-profile-picker-meta" style="text-align:center;padding:12px 0">No ladies assigned yet. Ask your director.</p>';
      return;
    }
    pickerList.innerHTML = "";
    for (const a of list) {
      const id = String(a.externalId);
      const alreadyOpen = openIds.has(id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.id = id;
      btn.className =
        "agency-profile-picker-item" +
        (alreadyOpen ? " is-open" : "") +
        (selectedIds.has(id) ? " is-selected" : "");
      btn.innerHTML = `
        <span class="agency-profile-picker-check" aria-hidden="true"></span>
        <span class="agency-profile-picker-avatar">${escapeHtml(initials(a.displayName))}</span>
        <span>
          <div class="agency-profile-picker-name">${escapeHtml(a.displayName)}</div>
          <div class="agency-profile-picker-meta">ID ${escapeHtml(a.externalId)}</div>
        </span>
        ${alreadyOpen ? '<span class="agency-profile-picker-badge">Open</span>' : ""}
      `;
      btn.addEventListener("click", async () => {
        if (batchRunning) return;
        if (alreadyOpen) {
          const open = await window.bracho.openAnketa(a);
          if (!open.ok) setPickerError(open.error || "Could not open");
          return;
        }
        toggleSelect(id, false);
      });
      pickerList.appendChild(btn);
    }
  }

  async function loginSelected() {
    const list = [...selectedIds]
      .filter((id) => !openIds.has(id))
      .map((id) => anketaById.get(id))
      .filter(Boolean);
    if (!list.length) {
      setPickerError("Select at least one questionnaire");
      return;
    }

    batchRunning = true;
    updateLoginSelectedBtn();
    setPickerError("");
    resetConnectingLog();
    showConnecting(
      `Connecting: ${firstName(list[0].displayName)}`,
      `1 of ${list.length}`,
    );

    const unsub = window.bracho.onBatchProgress((p) => {
      if (!p) return;
      const name = firstName(p.name || p.externalId || "Lady");
      const id = String(p.externalId || name);
      if (p.phase === "login") {
        showConnecting(`Connecting: ${name}`, `${p.index} of ${p.total}`);
        upsertConnectingLog(id, `${p.index}. Connecting: ${name}`, "login");
      } else if (p.phase === "done") {
        upsertConnectingLog(id, `${p.index}. Ready: ${name}`, "done");
        showConnecting(`Connecting…`, `${p.index} of ${p.total} ready`);
      } else if (p.phase === "error") {
        upsertConnectingLog(
          id,
          `${p.index}. Failed: ${name}${p.error ? ` — ${p.error}` : ""}`,
          "error",
        );
      }
    });

    try {
      const res = await window.bracho.openAnketyBatch(list);
      if (!res.ok && res.errors?.length) {
        setHidden(connecting, true);
        setPickerError(
          res.errors.map((x) => `${x.name}: ${x.error}`).join(" · ") ||
            "Some logins failed",
        );
        await loadLadies();
      }
      // On success work window is shown by main; overlay can stay until hide.
    } finally {
      unsub?.();
      batchRunning = false;
      updateLoginSelectedBtn();
    }
  }

  els.togglePassword?.addEventListener("click", () => {
    const show = els.password.type === "password";
    els.password.type = show ? "text" : "password";
    els.togglePassword.setAttribute("aria-pressed", show ? "true" : "false");
    els.togglePassword.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("");
    setBusy(true);
    const remember = Boolean(els.remember?.checked);
    const res = await window.bracho.login(
      els.email.value.trim(),
      els.password.value,
      remember,
    );
    if (!res.ok) {
      setBusy(false);
      setStatus(res.error || "Login failed", true);
      return;
    }
    if (!remember && els.password) els.password.value = "";
    setBusy(false);
    showPicker();
    await loadLadies();
  });

  pickerLogin?.addEventListener("click", () => loginSelected());

  pickerCancel?.addEventListener("click", async () => {
    await window.bracho.logout();
    showLogin();
  });

  pickerBack?.addEventListener("click", async () => {
    const res = await window.bracho.backToChats();
    if (!res.ok) setPickerError(res.error || "No open chats");
  });

  window.bracho.onShowAnkety(async (payload) => {
    const session = await window.bracho.getSession();
    if (session.hasToken && session.user) {
      showPicker({
        openIds: payload.openIds || session.openIds || [],
        hasOpenTabs: payload.hasOpenTabs ?? session.hasOpenTabs,
      });
      await loadLadies();
    } else {
      showLogin();
    }
  });

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => buildAuthWatermark({ force: true }), 200);
  });

  (async () => {
    buildAuthWatermark();
    await fillSavedLogin();
    showLogin();
    const step = new URLSearchParams(location.search).get("step");
    const session = await window.bracho.getSession();
    if (step === "ankety" && session.hasToken && session.user) {
      showPicker({
        openIds: session.openIds || [],
        hasOpenTabs: session.hasOpenTabs,
      });
      await loadLadies();
    }
  })();
})();
