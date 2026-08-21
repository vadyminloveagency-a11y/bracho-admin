/**
 * Show Golden Bride Broadcast UI (undo Bracho hide).
 */

function hideBroadcastUiScript() {
  // Kept name for callers: now restores visibility instead of hiding.
  return showBroadcastUiScript();
}

function showBroadcastUiScript() {
  return `
    (function () {
      try {
        if (window.__brachoBcHideObs) {
          try { window.__brachoBcHideObs.disconnect(); } catch (_) {}
          window.__brachoBcHideObs = null;
        }
        window.__brachoBcHidePaint = null;
        window.__brachoBcHideInstalled = false;
        clearTimeout(window.__brachoBcHideT);

        Array.from(document.querySelectorAll('[data-bracho-bc-hide="1"]')).forEach((el) => {
          el.removeAttribute('data-bracho-bc-hide');
          try {
            el.style.removeProperty('display');
            el.style.removeProperty('visibility');
            el.style.removeProperty('opacity');
          } catch (_) {}
        });

        const style = document.getElementById('bracho-bc-hide-style');
        if (style) style.remove();
      } catch (_) {}
      return { ok: true, visible: true };
    })();
  `;
}

module.exports = { hideBroadcastUiScript, showBroadcastUiScript };
