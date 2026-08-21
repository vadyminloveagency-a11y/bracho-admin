const { apiBase, readConfig, writeConfig } = require("./config");

async function login(email, password) {
  const res = await fetch(`${apiBase()}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Login failed");
  if (data.user?.role !== "OPERATOR") {
    throw new Error("Only operators can use this program");
  }
  if (!data.token) throw new Error("Server did not return token");
  writeConfig({ token: data.token, user: data.user });
  return data;
}

async function fetchMyAnkety() {
  const { token } = readConfig();
  if (!token) throw new Error("Not logged in");
  const res = await fetch(`${apiBase()}/api/operator/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load ankety");
  return data;
}

async function presenceHeartbeat(anketaId) {
  const { token } = readConfig();
  const id = String(anketaId || "").trim();
  if (!token || !id) return { ok: false };
  try {
    const res = await fetch(`${apiBase()}/api/presence`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ anketaId: id }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, ...data };
  } catch (e) {
    return { ok: false, error: e?.message || "presence failed" };
  }
}

async function presenceClear(anketaId) {
  const { token } = readConfig();
  if (!token) return { ok: false };
  try {
    const q = anketaId
      ? `?anketaId=${encodeURIComponent(String(anketaId))}`
      : "";
    const res = await fetch(`${apiBase()}/api/presence${q}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, error: e?.message || "presence clear failed" };
  }
}

async function fetchGoldmanManIds() {
  const { token } = readConfig();
  if (!token) {
    console.warn("[bracho] fetchGoldmanManIds: no token");
    return [];
  }
  try {
    const res = await fetch(`${apiBase()}/api/goldman-agency`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn("[bracho] fetchGoldmanManIds failed", res.status, data.error || "");
      return [];
    }
    if (Array.isArray(data.ids)) {
      return data.ids.map((id) => String(id || "").trim()).filter(Boolean);
    }
    return (data.items || [])
      .map((row) => String(row?.externalId || "").trim())
      .filter(Boolean);
  } catch (e) {
    console.warn("[bracho] fetchGoldmanManIds error", e?.message || e);
    return [];
  }
}

/** Push unique payee IDs from Home viewer toasts into Goldman Agency (isNew). */
async function pushGoldmanViewerIds(ids) {
  const { token } = readConfig();
  const list = [...new Set(
    (Array.isArray(ids) ? ids : [])
      .map((id) => String(id || "").trim())
      .filter((id) => /^\d{3,12}$/.test(id)),
  )];
  if (!token || !list.length) {
    return { ok: false, added: 0, skipped: 0 };
  }
  try {
    const res = await fetch(`${apiBase()}/api/goldman-agency`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ source: "viewer", ids: list }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn(
        "[bracho] pushGoldmanViewerIds failed",
        res.status,
        data.error || "",
      );
      return { ok: false, added: 0, skipped: 0, error: data.error };
    }
    return {
      ok: true,
      added: Number(data.added) || 0,
      skipped: Number(data.skipped) || 0,
    };
  } catch (e) {
    console.warn("[bracho] pushGoldmanViewerIds error", e?.message || e);
    return { ok: false, added: 0, skipped: 0, error: e?.message || String(e) };
  }
}

function logout() {
  writeConfig({ token: null, user: null });
}

module.exports = {
  login,
  fetchMyAnkety,
  logout,
  presenceHeartbeat,
  presenceClear,
  fetchGoldmanManIds,
  pushGoldmanViewerIds,
};
