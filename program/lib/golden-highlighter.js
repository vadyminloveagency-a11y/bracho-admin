/**
 * Dollar coin badge on man avatars — top-right corner overlay.
 * Active/Contacts: #contBlock … span.img
 * Men Online:      #profBlock … span.photo
 */
function highlightMarkedIdsScript(ids) {
  const list = JSON.stringify(
    (Array.isArray(ids) ? ids : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );
  return `
    (function () {
      window.__brachoMarkedIds = new Set(${list});

      const STYLE_ID = 'bracho-marked-style';
      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        (document.head || document.documentElement).appendChild(style);
      }
      style.textContent = \`
        span.img.bracho-coin-host,
        span.photo.bracho-coin-host {
          position: relative !important;
        }
        .bracho-coin {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          position: absolute !important;
          top: -3px !important;
          right: -3px !important;
          width: 14px !important;
          height: 14px !important;
          min-width: 14px !important;
          min-height: 14px !important;
          margin: 0 !important;
          padding: 0 !important;
          border: 1px solid #8a6500 !important;
          border-radius: 50% !important;
          background:
            radial-gradient(circle at 30% 28%, #fff8d0 0%, #ffd34a 42%, #e0a800 78%, #b8860b 100%) !important;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.85),
            inset 0 1px 1px rgba(255,255,255,0.7),
            inset 0 -1px 1px rgba(0,0,0,0.2) !important;
          color: #6b4700 !important;
          font: 800 9px/1 "Segoe UI", Arial, sans-serif !important;
          pointer-events: none !important;
          user-select: none !important;
          z-index: 60 !important;
          box-sizing: border-box !important;
          float: none !important;
        }
        .bracho-coin::before {
          content: '$' !important;
          display: block !important;
          font-size: 9px !important;
          font-weight: 800 !important;
          line-height: 1 !important;
          color: #6b4700 !important;
        }
      \`;

      function makeCoin(manId) {
        const coin = document.createElement('span');
        coin.className = 'bracho-coin';
        coin.title = 'Goldman Agency';
        coin.setAttribute('aria-hidden', 'true');
        if (manId) coin.setAttribute('data-bracho-man', String(manId));
        return coin;
      }

      function avatarHost(root) {
        if (!root || !root.querySelector) return null;
        return (
          root.querySelector('span.img') ||
          root.querySelector('span.photo') ||
          null
        );
      }

      function placeCoin(root, manId) {
        if (!root) return;
        root.querySelectorAll('.bracho-coin').forEach((n) => n.remove());
        root.querySelectorAll('.bracho-coin-host').forEach((n) => {
          n.classList.remove('bracho-coin-host');
        });

        const host = avatarHost(root);
        if (!host) return;

        host.classList.add('bracho-coin-host');
        host.appendChild(makeCoin(manId));
      }

      function manIdFromEl(el) {
        if (!el || !el.id) return '';
        const id = String(el.id);
        if (id.indexOf('contBlock') === 0) return id.slice(9);
        if (id.indexOf('profBlock') === 0) return id.slice(9);
        if (/^\\d+$/.test(id)) return id;
        return '';
      }

      function paint() {
        if (window.__brachoMarkedPaintBusy) return;
        window.__brachoMarkedPaintBusy = true;
        try {
          const ids = window.__brachoMarkedIds || new Set();
          if (!ids.size) {
            document.querySelectorAll('.bracho-coin').forEach((el) => el.remove());
            document.querySelectorAll('.bracho-coin-host').forEach((el) => {
              el.classList.remove('bracho-coin-host');
            });
            return;
          }
          document.querySelectorAll('[id^="contBlock"]').forEach((el) => {
            const mid = manIdFromEl(el);
            if (mid && ids.has(mid)) placeCoin(el, mid);
            else {
              el.querySelectorAll('.bracho-coin').forEach((c) => c.remove());
              el.querySelectorAll('.bracho-coin-host').forEach((h) => {
                h.classList.remove('bracho-coin-host');
              });
            }
          });
          document.querySelectorAll('[id^="profBlock"]').forEach((el) => {
            const mid = manIdFromEl(el);
            if (mid && ids.has(mid)) placeCoin(el, mid);
            else {
              el.querySelectorAll('.bracho-coin').forEach((c) => c.remove());
              el.querySelectorAll('.bracho-coin-host').forEach((h) => {
                h.classList.remove('bracho-coin-host');
              });
            }
          });
        } finally {
          window.__brachoMarkedPaintBusy = false;
        }
      }

      paint();
      if (window.__brachoMarkedTimer) clearInterval(window.__brachoMarkedTimer);
      window.__brachoMarkedTimer = setInterval(paint, 3000);

      return {
        ok: true,
        count: window.__brachoMarkedIds.size,
        cont: document.querySelectorAll('[id^="contBlock"]').length,
        prof: document.querySelectorAll('[id^="profBlock"]').length,
      };
    })();
  `;
}

module.exports = { highlightMarkedIdsScript };
