/**
 * Silent Home viewer-toast collector.
 * Payee = visible Golden replenishedIcon ($). Freebie icon is display:none — skip.
 * Man ID from GWT: item.__listener.q.a
 */
function viewerCollectInstallScript() {
  return `
    (function () {
      if (window.__brachoViewerCollectInstalled) return 'ok';
      window.__brachoViewerCollectInstalled = true;
      window.__brachoViewerPayees = Array.isArray(window.__brachoViewerPayees)
        ? window.__brachoViewerPayees
        : [];
      const seen = new Set(window.__brachoViewerPayees.map(String));

      function isVisiblePayee(item) {
        const icon = item.querySelector('.replenishedIcon');
        if (!icon) return false;
        const st = window.getComputedStyle(icon);
        if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) {
          return false;
        }
        const box = icon.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      }

      function manIdFromItem(item) {
        try {
          const raw = item.__listener && item.__listener.q && item.__listener.q.a;
          if (raw == null) return null;
          const id = String(raw).trim();
          return /^\\d{3,12}$/.test(id) ? id : null;
        } catch (e) {
          return null;
        }
      }

      function scan() {
        const items = document.querySelectorAll('.notifications .item');
        for (const item of items) {
          if (!isVisiblePayee(item)) continue;
          const id = manIdFromItem(item);
          if (!id || seen.has(id)) continue;
          seen.add(id);
          window.__brachoViewerPayees.push(id);
        }
      }

      scan();
      window.setInterval(scan, 1500);
      try {
        const root =
          document.querySelector('.notifications') ||
          document.querySelector('.notifications-wrap') ||
          document.body;
        if (root && window.MutationObserver) {
          const mo = new MutationObserver(function () { scan(); });
          mo.observe(root, { childList: true, subtree: true });
        }
      } catch (e) {}
      return 'ok';
    })();
  `;
}

function viewerCollectDrainScript() {
  return `
    (function () {
      const buf = Array.isArray(window.__brachoViewerPayees)
        ? window.__brachoViewerPayees
        : [];
      const ids = [...new Set(buf.map(String).map(function (s) { return s.trim(); }).filter(Boolean))];
      window.__brachoViewerPayees = [];
      return ids;
    })();
  `;
}

module.exports = {
  viewerCollectInstallScript,
  viewerCollectDrainScript,
};
