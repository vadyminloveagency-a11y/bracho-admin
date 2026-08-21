/**
 * Better spelling suggestions via LanguageTool (RU / UK),
 * closer to Edge-quality than Electron Hunspell alone.
 */

const LT_URL = "https://api.languagetool.org/v2/check";

function spellLangFromSettings() {
  try {
    const { getTranslatorSettings, normalizeReadTarget } = require("./translate");
    const read = normalizeReadTarget(getTranslatorSettings().readTarget);
    return read === "uk" ? "uk-UA" : "ru-RU";
  } catch (_) {
    return "ru-RU";
  }
}

function extractWord(params = {}) {
  const misspelled = String(params.misspelledWord || "").trim();
  if (misspelled) return misspelled;
  const sel = String(params.selectionText || "").trim();
  if (!sel) return "";
  // One word or short phrase only.
  if (sel.length > 80) return "";
  if (/\s/.test(sel) && sel.split(/\s+/).length > 3) return "";
  return sel;
}

/**
 * @returns {Promise<string[]>}
 */
async function fetchLanguageToolSuggestions(text, langCode) {
  const word = String(text || "").trim();
  if (!word || word.length > 120) return [];

  const language = langCode || spellLangFromSettings();
  const body = new URLSearchParams();
  body.set("text", word);
  body.set("language", language);
  // Also try sibling language if first returns nothing — handled by caller.

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4500);
  try {
    const res = await fetch(LT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return [];
    const out = [];
    const seen = new Set();
    for (const match of data.matches || []) {
      for (const rep of match.replacements || []) {
        const v = String(rep.value || "").trim();
        if (!v || seen.has(v)) continue;
        seen.add(v);
        out.push(v);
        if (out.length >= 8) return out;
      }
    }
    return out;
  } catch (_) {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch suggestions for RU and UK (best first by settings preference).
 */
async function getSmartSpellSuggestions(params) {
  const word = extractWord(params);
  if (!word) return { word: "", suggestions: [] };

  const preferred = spellLangFromSettings();
  const other = preferred === "uk-UA" ? "ru-RU" : "uk-UA";

  let suggestions = await fetchLanguageToolSuggestions(word, preferred);
  if (!suggestions.length) {
    suggestions = await fetchLanguageToolSuggestions(word, other);
  }

  // Merge with Electron native (often weak, but keep unique extras).
  const native = Array.isArray(params.dictionarySuggestions)
    ? params.dictionarySuggestions
    : [];
  const seen = new Set(suggestions.map((s) => s.toLowerCase()));
  for (const n of native) {
    const v = String(n || "").trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    suggestions.push(v);
    if (suggestions.length >= 10) break;
  }

  return { word, suggestions };
}

module.exports = {
  getSmartSpellSuggestions,
  extractWord,
  spellLangFromSettings,
};
