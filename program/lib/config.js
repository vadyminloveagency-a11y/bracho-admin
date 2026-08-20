const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const DEFAULT_API = "https://bracho.onrender.com";

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2));
  return next;
}

function apiBase() {
  return (readConfig().apiBase || process.env.BRACHO_API || DEFAULT_API).replace(
    /\/$/,
    "",
  );
}

module.exports = { readConfig, writeConfig, apiBase, DEFAULT_API };
