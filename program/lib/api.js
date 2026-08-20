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

function logout() {
  writeConfig({ token: null, user: null });
}

module.exports = { login, fetchMyAnkety, logout };
