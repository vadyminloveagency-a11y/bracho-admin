/**
 * Preload for Golden Bride BrowserViews.
 * contextIsolation is false so page patches apply.
 */

const { ipcRenderer } = require("electron");

window.__brachoIpc = {
  visitToggle: () => ipcRenderer.invoke("bracho:profile-visit-toggle"),
};

ipcRenderer.on("bracho:profile-visit-state", (_e, state) => {
  try {
    if (typeof window.__brachoVisitSetState === "function") {
      window.__brachoVisitSetState(state || {});
    }
  } catch (_) {}
});

/** Golden pages sleep hidden tabs. Stay "visible". */
function keepPageVisible() {
  try {
    Object.defineProperty(Document.prototype, "hidden", {
      configurable: true,
      get() {
        return false;
      },
    });
    Object.defineProperty(Document.prototype, "visibilityState", {
      configurable: true,
      get() {
        return "visible";
      },
    });
  } catch (_) {
    try {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => false,
      });
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
    } catch (_) {}
  }
}

keepPageVisible();
window.addEventListener("DOMContentLoaded", keepPageVisible, true);
document.addEventListener(
  "visibilitychange",
  (e) => {
    e.stopImmediatePropagation();
  },
  true,
);
