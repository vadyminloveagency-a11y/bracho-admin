const { readConfig } = require("./config");

const GOOGLE_URL = "https://translation.googleapis.com/language/translate/v2";

function deeplEndpoint(apiKey) {
  const key = String(apiKey || "");
  // Free keys usually end with :fx
  if (key.includes(":fx")) return "https://api-free.deepl.com/v2/translate";
  return "https://api.deepl.com/v2/translate";
}

function normalizeReadTarget(raw) {
  const s = String(raw || "ru").trim().toLowerCase();
  if (s === "uk" || s === "ua" || s === "ukrainian" || s === "украинский") return "uk";
  return "ru";
}

function getTranslatorSettings() {
  const cfg = readConfig();
  const provider = cfg.translatorProvider === "deepl" ? "deepl" : "google";
  return {
    provider,
    googleApiKey: String(cfg.googleTranslateApiKey || ""),
    deeplApiKey: String(cfg.deeplApiKey || ""),
    readTarget: normalizeReadTarget(cfg.translatorReadTarget),
    writeTarget: String(cfg.translatorWriteTarget || "en"),
  };
}

function activeApiKey(settings) {
  if (settings.provider === "deepl") return String(settings.deeplApiKey || "").trim();
  return String(settings.googleApiKey || "").trim();
}

async function translateWithGoogle(apiKey, text, targetLang) {
  const url = `${GOOGLE_URL}?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      target: String(targetLang || "en").toLowerCase(),
      format: "text",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.error?.errors?.[0]?.message ||
      `Google HTTP ${res.status}`;
    throw new Error(msg);
  }
  const translated =
    data?.data?.translations?.[0]?.translatedText ||
    data?.translations?.[0]?.translatedText ||
    "";
  if (!translated) throw new Error("Empty Google translation");
  return {
    translated: String(translated),
    detected: data?.data?.translations?.[0]?.detectedSourceLanguage || "",
    provider: "google",
  };
}

async function translateWithDeepl(apiKey, text, targetLang) {
  let target = String(targetLang || "EN").toUpperCase();
  if (target === "UA") target = "UK";
  if (target === "EN-US" || target === "EN-GB") target = "EN";
  const body = new URLSearchParams();
  body.set("text", text);
  body.set("target_lang", target);

  const res = await fetch(deeplEndpoint(apiKey), {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || data?.error || `DeepL HTTP ${res.status}`;
    throw new Error(msg);
  }
  const translated = data?.translations?.[0]?.text || "";
  if (!translated) throw new Error("Empty DeepL translation");
  return {
    translated: String(translated),
    detected: data?.translations?.[0]?.detected_source_language || "",
    provider: "deepl",
  };
}

/**
 * @param {{ text: string, mode?: 'read'|'write', targetLang?: string }} opts
 */
async function translateText(opts = {}) {
  const text = String(opts.text || "").trim();
  if (!text) throw new Error("No text selected");
  if (text.length > 5000) throw new Error("Text too long (max 5000)");

  const settings = getTranslatorSettings();
  const key = activeApiKey(settings);
  if (!key) {
    throw new Error(
      settings.provider === "deepl"
        ? "DeepL API key is empty — open Settings"
        : "Google API key is empty — open Settings",
    );
  }

  const mode = opts.mode === "write" ? "write" : "read";
  let targetLang =
    opts.targetLang ||
    (mode === "write" ? settings.writeTarget : settings.readTarget);
  if (mode === "read") targetLang = normalizeReadTarget(targetLang);
  if (mode === "write") targetLang = "en";

  if (settings.provider === "deepl") {
    return translateWithDeepl(key, text, targetLang);
  }
  return translateWithGoogle(key, text, targetLang);
}

module.exports = {
  getTranslatorSettings,
  activeApiKey,
  translateText,
  normalizeReadTarget,
};
