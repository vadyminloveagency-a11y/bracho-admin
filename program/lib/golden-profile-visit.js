/**
 * Silent man-profile "visit" via GWT RPC only — no UI navigation.
 * Captured: POST /ladymodule/services/rpc loadEntity mandto|{id}
 * Can run from Chat (same cookies); does not open VIEWMANPAGE.
 */

const GWT_FALLBACK = {
  strong: "6194265CA9BA5095E40F4AEE22413C7F",
  perm: "8D7AC9E3818039E53F8C64289B32F39E",
  base: "https://goldenbride.net/ladymodule/",
};

function collectOnlineManIdsScript() {
  return `
    (function () {
      const ids = new Set();
      function add(raw) {
        const id = String(raw == null ? '' : raw).trim();
        if (/^\\d{3,12}$/.test(id)) ids.add(id);
      }
      try {
        if (Array.isArray(window.onlineUsers)) {
          for (const u of window.onlineUsers) {
            if (u == null) continue;
            if (typeof u === 'number' || typeof u === 'string') add(u);
            else if (typeof u === 'object') {
              add(u.id);
              add(u.userId);
              add(u.manId);
              add(u.login);
              add(u.uid);
            }
          }
        }
      } catch (e) {}
      try {
        document.querySelectorAll('[id^="profBlock"]').forEach(function (el) {
          add(String(el.id || '').replace(/^profBlock/, ''));
        });
      } catch (e) {}
      return { ok: true, ids: Array.from(ids) };
    })();
  `;
}

/** Cache X-GWT-* from any ladymodule RPC on this page (Home comet etc.). */
function gwtCaptureInstallScript() {
  return `
    (function () {
      if (window.__brachoGwtCapture) return window.__brachoGwt || null;
      window.__brachoGwtCapture = true;
      window.__brachoGwt = window.__brachoGwt || {
        strong: ${JSON.stringify(GWT_FALLBACK.strong)},
        perm: ${JSON.stringify(GWT_FALLBACK.perm)},
        base: ${JSON.stringify(GWT_FALLBACK.base)},
      };
      try {
        const open = XMLHttpRequest.prototype.open;
        const send = XMLHttpRequest.prototype.send;
        const setHeader = XMLHttpRequest.prototype.setRequestHeader;
        XMLHttpRequest.prototype.open = function (m, u) {
          this.__brachoUrl = String(u || '');
          this.__brachoHeaders = {};
          return open.apply(this, arguments);
        };
        XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
          try { this.__brachoHeaders[String(k)] = String(v); } catch (e) {}
          return setHeader.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function (body) {
          try {
            if (/ladymodule\\/services\\/rpc/i.test(this.__brachoUrl || '')) {
              const b = String(body == null ? '' : body);
              const m = b.match(/ladymodule\\/\\|([A-F0-9]{32})\\|/i);
              if (m) window.__brachoGwt.strong = m[1];
              const h = this.__brachoHeaders || {};
              const perm = h['X-GWT-Permutation'] || h['x-gwt-permutation'];
              const base = h['X-GWT-Module-Base'] || h['x-gwt-module-base'];
              if (perm) window.__brachoGwt.perm = perm;
              if (base) window.__brachoGwt.base = base;
            }
          } catch (e) {}
          return send.apply(this, arguments);
        };
      } catch (e) {}
      return window.__brachoGwt;
    })();
  `;
}

function visitManProfileScript(manId) {
  const id = String(manId || "").trim();
  return `
    (async function () {
      const id = ${JSON.stringify(id)};
      if (!/^\\d{3,12}$/.test(id)) return { ok: false, error: 'bad id' };

      const g = window.__brachoGwt || {};
      const strong = g.strong || ${JSON.stringify(GWT_FALLBACK.strong)};
      const perm = g.perm || ${JSON.stringify(GWT_FALLBACK.perm)};
      let base = g.base || ${JSON.stringify(GWT_FALLBACK.base)};
      if (base.slice(-1) !== '/') base += '/';

      const body =
        '7|0|8|' + base + '|' + strong +
        '|com.lady.shared.dataaccess.IDataServlet|loadEntity|java.lang.String/2004016611|com.lady.shared.dataaccess.TOILazy$LoadStage/3035238444|mandto|' +
        id + '|1|2|3|4|3|5|5|6|7|8|6|3|';

      try {
        const res = await fetch(base + 'services/rpc', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'text/x-gwt-rpc; charset=UTF-8',
            'X-GWT-Module-Base': base,
            'X-GWT-Permutation': perm,
          },
          body: body,
        });
        const text = await res.text();
        const isOk = res.ok && /^\\/\\/OK/i.test(text);
        const isEx = /^\\/\\/EX/i.test(text);
        return {
          ok: isOk,
          status: res.status,
          id: id,
          mode: 'rpc',
          error: isOk ? '' : (isEx ? 'gwt exception' : ('http ' + res.status)),
          head: String(text || '').slice(0, 120),
        };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e), mode: 'rpc' };
      }
    })();
  `;
}

module.exports = {
  collectOnlineManIdsScript,
  gwtCaptureInstallScript,
  visitManProfileScript,
  GWT_FALLBACK,
};
