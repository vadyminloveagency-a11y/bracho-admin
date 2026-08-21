/**
 * Round on/off Visit-online toggle — always visible fixed in Golden chat.
 */

function visitToggleInstallScript(initialRunning = false) {
  const running = Boolean(initialRunning);
  return `
    (function () {
      const STYLE_ID = 'bracho-visit-toggle-style';
      const ROOT_ID = 'bracho-visit-toggle';
      const running0 = ${running ? "true" : "false"};

      if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = \`
          #bracho-visit-toggle {
            position: fixed !important;
            top: 12px !important;
            right: 16px !important;
            z-index: 2147483646 !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 40px !important;
            height: 40px !important;
            min-width: 40px !important;
            min-height: 40px !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 2px solid #94a3b8 !important;
            border-radius: 50% !important;
            background: #f1f5f9 !important;
            box-shadow: 0 4px 14px rgba(0,0,0,0.22) !important;
            cursor: pointer !important;
            user-select: none !important;
            transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease !important;
          }
          #bracho-visit-toggle::after {
            content: '' !important;
            width: 14px !important;
            height: 14px !important;
            border-radius: 50% !important;
            background: #94a3b8 !important;
            transition: background 0.15s ease !important;
          }
          #bracho-visit-toggle.is-on {
            border-color: #16a34a !important;
            background: #dcfce7 !important;
            box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.25), 0 4px 14px rgba(0,0,0,0.2) !important;
          }
          #bracho-visit-toggle.is-on::after {
            background: #16a34a !important;
          }
          #bracho-visit-toggle.is-busy {
            opacity: 0.6 !important;
            pointer-events: none !important;
          }
        \`;
        (document.head || document.documentElement).appendChild(style);
      }

      function setState(state) {
        const root = document.getElementById(ROOT_ID);
        if (!root) return;
        const on = Boolean(state && state.running);
        root.classList.toggle('is-on', on);
        root.setAttribute('aria-pressed', on ? 'true' : 'false');
        const cur = Number(state && state.index) || 0;
        const total = Number(state && state.total) || 0;
        root.title = on
          ? ('Visit online ON' + (total ? (' ' + cur + '/' + total) : '') + ' — click to stop')
          : 'Visit online OFF — click to start';
      }

      window.__brachoVisitSetState = setState;

      let root = document.getElementById(ROOT_ID);
      if (!root) {
        root = document.createElement('button');
        root.type = 'button';
        root.id = ROOT_ID;
        root.setAttribute('aria-label', 'Visit online');
        (document.documentElement || document.body).appendChild(root);

        const click = async function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (root.classList.contains('is-busy')) return;
          root.classList.add('is-busy');
          try {
            if (window.__brachoIpc && typeof window.__brachoIpc.visitToggle === 'function') {
              const res = await window.__brachoIpc.visitToggle();
              if (res && res.ok === false && res.error) {
                root.title = String(res.error);
              } else if (res) {
                setState(res);
              }
            } else {
              root.title = 'Visit IPC missing — restart Bracho';
            }
          } catch (err) {
            root.title = String(err && err.message || err);
          } finally {
            root.classList.remove('is-busy');
          }
        };
        root.addEventListener('click', click, true);
      }

      setState({ running: running0, index: 0, total: 0 });
      return { ok: true, hasIpc: !!(window.__brachoIpc && window.__brachoIpc.visitToggle) };
    })();
  `;
}

module.exports = { visitToggleInstallScript };
