const viewLogin = document.getElementById("view-login");
const viewAnkety = document.getElementById("view-ankety");
const subtitle = document.getElementById("subtitle");
const loginError = document.getElementById("login-error");
const anketyError = document.getElementById("ankety-error");
const anketyList = document.getElementById("ankety-list");
const who = document.getElementById("who");
const apiBaseEl = document.getElementById("api-base");

function showError(el, msg) {
  if (!msg) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

function showLogin() {
  viewLogin.hidden = false;
  viewAnkety.hidden = true;
  subtitle.textContent = "Вход оператора";
}

function showAnkety(user) {
  viewLogin.hidden = true;
  viewAnkety.hidden = false;
  subtitle.textContent = "Анкеты";
  who.textContent = user ? `${user.name} · ${user.email}` : "";
}

async function loadAnkety() {
  showError(anketyError, "");
  anketyList.innerHTML = "<p class='empty'>Загрузка…</p>";
  const res = await window.bracho.getAnkety();
  if (!res.ok) {
    anketyList.innerHTML = "";
    showError(anketyError, res.error || "Ошибка загрузки");
    return;
  }
  const list = res.ankety || [];
  if (!list.length) {
    anketyList.innerHTML =
      "<p class='empty'>Директор ещё не назначил вам анкеты.</p>";
    return;
  }
  anketyList.innerHTML = "";
  for (const a of list) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "anketa";
    btn.innerHTML = `<strong>${escapeHtml(a.displayName)}</strong><small>ID ${escapeHtml(a.externalId)} · ${escapeHtml(a.site)}</small>`;
    btn.onclick = async () => {
      btn.disabled = true;
      const open = await window.bracho.openAnketa(a);
      if (!open.ok) {
        showError(anketyError, open.error || "Не удалось открыть");
        btn.disabled = false;
      }
    };
    anketyList.appendChild(btn);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

document.getElementById("btn-login").onclick = async () => {
  showError(loginError, "");
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const btn = document.getElementById("btn-login");
  btn.disabled = true;
  const res = await window.bracho.login(email, password);
  btn.disabled = false;
  if (!res.ok) {
    showError(loginError, res.error || "Ошибка входа");
    return;
  }
  showAnkety(res.user);
  await loadAnkety();
};

document.getElementById("btn-logout").onclick = async () => {
  await window.bracho.logout();
  showLogin();
};

(async () => {
  apiBaseEl.textContent = await window.bracho.getApiBase();
  const session = await window.bracho.getSession();
  if (session.hasToken && session.user) {
    showAnkety(session.user);
    await loadAnkety();
  } else {
    showLogin();
  }
})();
