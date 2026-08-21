/**
 * In-page translator UI helpers for Golden BrowserViews.
 * Ctrl+Space is handled in main; these scripts read selection / apply result.
 */

function getSelectionForTranslateScript() {
  return `
    (function () {
      function isEditable(el) {
        if (!el) return false;
        const tag = String(el.tagName || '').toUpperCase();
        if (tag === 'TEXTAREA') return true;
        if (tag === 'INPUT') {
          const type = String(el.type || 'text').toLowerCase();
          return !/^(button|checkbox|radio|submit|reset|file|image|range|color|hidden)$/.test(type);
        }
        if (el.isContentEditable) return true;
        return false;
      }

      const ae = document.activeElement;
      const editable = isEditable(ae);
      let text = '';
      let mode = 'read';

      if (editable) {
        mode = 'write';
        // Whole field under cursor — no need to highlight/select.
        if (typeof ae.value === 'string') {
          text = String(ae.value || '');
        } else if (ae.isContentEditable) {
          text = String(ae.innerText || ae.textContent || '');
        }
      } else {
        const sel = window.getSelection && window.getSelection();
        text = sel ? String(sel.toString() || '') : '';
      }

      text = String(text || '').replace(/\\u00a0/g, ' ').trim();
      let rect = { x: Math.round(window.innerWidth / 2 - 160), y: 80, w: 0, h: 0 };
      try {
        if (editable && ae.getBoundingClientRect) {
          const r = ae.getBoundingClientRect();
          rect = {
            x: Math.round(r.left),
            y: Math.round(Math.max(8, r.top - 8)),
            w: Math.round(r.width),
            h: Math.round(r.height),
          };
        } else {
          const sel = window.getSelection && window.getSelection();
          if (sel && sel.rangeCount) {
            const r = sel.getRangeAt(0).getBoundingClientRect();
            if (r && (r.width || r.height || r.top || r.left)) {
              rect = {
                x: Math.round(r.left),
                y: Math.round(r.bottom + 8),
                w: Math.round(r.width),
                h: Math.round(r.height),
              };
            }
          }
        }
      } catch (e) {}

      return { ok: true, text: text, mode: mode, rect: rect };
    })();
  `;
}

function applyWriteTranslationScript(translated) {
  const value = JSON.stringify(String(translated ?? ""));
  return `
    (function () {
      const translated = ${value};
      const ae = document.activeElement;
      if (!ae) return { ok: false, error: 'no focus' };

      const tag = String(ae.tagName || '').toUpperCase();
      if ((tag === 'TEXTAREA' || tag === 'INPUT') && typeof ae.value === 'string') {
        const proto = tag === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) desc.set.call(ae, translated);
        else ae.value = translated;
        try { ae.setSelectionRange(translated.length, translated.length); } catch (e) {}
        ae.dispatchEvent(new Event('input', { bubbles: true }));
        ae.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, mode: 'write' };
      }

      if (ae.isContentEditable) {
        try {
          ae.focus();
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(ae);
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand('insertText', false, translated);
          return { ok: true, mode: 'write' };
        } catch (e) {
          return { ok: false, error: String(e && e.message || e) };
        }
      }
      return { ok: false, error: 'not editable' };
    })();
  `;
}

function showTranslatePopupScript(payload) {
  const data = JSON.stringify(payload || {});
  return `
    (function () {
      const payload = ${data};
      const STYLE_ID = 'bracho-translate-style';
      const BOX_ID = 'bracho-translate-popup';

      // Drop previous outside-click handler if any.
      if (window.__brachoTrOutside && typeof window.__brachoTrOutside === 'function') {
        try { document.removeEventListener('mousedown', window.__brachoTrOutside, true); } catch (e) {}
        window.__brachoTrOutside = null;
      }

      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = \`
          #bracho-translate-popup {
            position: fixed !important;
            z-index: 2147483646 !important;
            max-width: min(420px, calc(100vw - 24px)) !important;
            min-width: 240px !important;
            padding: 10px 12px 12px !important;
            border: 1px solid rgba(255, 140, 0, 0.65) !important;
            border-radius: 10px !important;
            background: rgba(16, 12, 10, 0.97) !important;
            color: #fff3e0 !important;
            box-shadow: 0 12px 36px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,140,0,0.12) !important;
            font: 500 13px/1.45 "Segoe UI", Arial, sans-serif !important;
            backdrop-filter: blur(6px);
          }
          #bracho-translate-popup.is-pinned {
            border-color: rgba(56, 189, 248, 0.75) !important;
            box-shadow: 0 12px 36px rgba(0,0,0,0.5), 0 0 0 1px rgba(56,189,248,0.2) !important;
          }
          #bracho-translate-popup .bracho-tr-head {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 8px !important;
            margin: 0 0 8px !important;
            cursor: move !important;
            touch-action: none !important;
          }
          #bracho-translate-popup .bracho-tr-title {
            display: inline-flex !important;
            align-items: center !important;
            gap: 7px !important;
            color: #ffcc80 !important;
            font: 700 11px/1 "Segoe UI", Arial, sans-serif !important;
            text-transform: uppercase !important;
            letter-spacing: 0.04em !important;
            pointer-events: none !important;
          }
          #bracho-translate-popup .bracho-tr-badge {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 18px !important;
            height: 18px !important;
            border-radius: 5px !important;
            background: rgba(255, 140, 0, 0.28) !important;
            border: 1px solid rgba(255, 140, 0, 0.55) !important;
            color: #ffe0b8 !important;
            font: 800 11px/1 "Segoe UI", Arial, sans-serif !important;
          }
          #bracho-translate-popup .bracho-tr-tools {
            display: inline-flex !important;
            align-items: center !important;
            gap: 2px !important;
          }
          #bracho-translate-popup .bracho-tr-tool {
            border: 0 !important;
            background: transparent !important;
            color: #ffcc80 !important;
            cursor: pointer !important;
            font: 700 14px/1 sans-serif !important;
            width: 26px !important;
            height: 26px !important;
            border-radius: 6px !important;
            padding: 0 !important;
          }
          #bracho-translate-popup .bracho-tr-tool:hover {
            background: rgba(255, 255, 255, 0.08) !important;
          }
          #bracho-translate-popup .bracho-tr-tool.is-on {
            color: #7dd3fc !important;
            background: rgba(56, 189, 248, 0.16) !important;
          }
          #bracho-translate-popup .bracho-tr-body {
            white-space: pre-wrap !important;
            word-break: break-word !important;
            color: #fff8f0 !important;
            max-height: 240px !important;
            overflow: auto !important;
          }
          #bracho-translate-popup .bracho-tr-err {
            color: #ff8a96 !important;
          }
        \`;
        (document.head || document.documentElement).appendChild(style);
      }

      let box = document.getElementById(BOX_ID);
      if (!box) {
        box = document.createElement('div');
        box.id = BOX_ID;
        document.documentElement.appendChild(box);
      }

      box.__brachoPinned = false;
      box.classList.remove('is-pinned');

      const title = payload.error
        ? 'Translate error'
        : ('Translated' + (payload.provider ? ' · ' + payload.provider : ''));
      const bodyClass = payload.error ? 'bracho-tr-body bracho-tr-err' : 'bracho-tr-body';
      const bodyText = payload.error ? String(payload.error) : String(payload.translated || '');

      box.innerHTML =
        '<div class="bracho-tr-head">' +
          '<span class="bracho-tr-title">' +
            (payload.error ? '' : '<span class="bracho-tr-badge" title="Translated">A</span>') +
            '<span>' + title + '</span>' +
          '</span>' +
          '<span class="bracho-tr-tools">' +
            (payload.error ? '' : '<button type="button" class="bracho-tr-tool" data-bracho-tr-pin title="Pin">📌</button>') +
            '<button type="button" class="bracho-tr-tool" data-bracho-tr-close title="Close" aria-label="Close">×</button>' +
          '</span>' +
        '</div>' +
        '<div class="' + bodyClass + '"></div>';

      box.querySelector('.bracho-tr-body').textContent = bodyText;

      const rect = payload.rect || { x: 24, y: 24 };
      let left = Number(rect.x) || 24;
      let top = Number(rect.y) || 24;
      box.style.left = '0px';
      box.style.top = '0px';
      box.style.display = 'block';
      const bw = box.offsetWidth || 280;
      const bh = box.offsetHeight || 120;
      left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
      top = Math.max(8, Math.min(top, window.innerHeight - bh - 8));
      box.style.left = left + 'px';
      box.style.top = top + 'px';

      const close = () => {
        try {
          if (window.__brachoTrOutside) {
            document.removeEventListener('mousedown', window.__brachoTrOutside, true);
            window.__brachoTrOutside = null;
          }
        } catch (e) {}
        try { box.remove(); } catch (e) {}
      };

      box.querySelector('[data-bracho-tr-close]')?.addEventListener('click', function (e) {
        e.stopPropagation();
        close();
      });

      const pinBtn = box.querySelector('[data-bracho-tr-pin]');
      if (pinBtn) {
        pinBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          box.__brachoPinned = !box.__brachoPinned;
          box.classList.toggle('is-pinned', box.__brachoPinned);
          pinBtn.classList.toggle('is-on', box.__brachoPinned);
          pinBtn.title = box.__brachoPinned ? 'Unpin' : 'Pin';
        });
      }

      // Drag by header (not by pin/close buttons).
      const head = box.querySelector('.bracho-tr-head');
      if (head && !head.__brachoDragBound) {
        head.__brachoDragBound = true;
        head.addEventListener('mousedown', function (e) {
          if (e.button !== 0) return;
          if (e.target && e.target.closest && e.target.closest('.bracho-tr-tool')) return;
          e.preventDefault();
          e.stopPropagation();
          const startX = e.clientX;
          const startY = e.clientY;
          const startLeft = parseFloat(box.style.left) || 0;
          const startTop = parseFloat(box.style.top) || 0;
          box.__brachoDragging = true;

          const onMove = function (ev) {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            const bw = box.offsetWidth || 280;
            const bh = box.offsetHeight || 120;
            let nl = startLeft + dx;
            let nt = startTop + dy;
            nl = Math.max(4, Math.min(nl, window.innerWidth - Math.min(bw, 80)));
            nt = Math.max(4, Math.min(nt, window.innerHeight - 40));
            box.style.left = nl + 'px';
            box.style.top = nt + 'px';
          };
          const onUp = function () {
            box.__brachoDragging = false;
            document.removeEventListener('mousemove', onMove, true);
            document.removeEventListener('mouseup', onUp, true);
          };
          document.addEventListener('mousemove', onMove, true);
          document.addEventListener('mouseup', onUp, true);
        }, true);
      }

      window.__brachoTrOutside = function (ev) {
        try {
          if (!document.getElementById(BOX_ID)) return;
          if (box.__brachoPinned) return;
          if (box.__brachoDragging) return;
          if (box.contains(ev.target)) return;
          close();
        } catch (e) {}
      };
      // Next tick so the opening click does not instantly close.
      setTimeout(function () {
        document.addEventListener('mousedown', window.__brachoTrOutside, true);
      }, 0);

      return { ok: true };
    })();
  `;
}

function hideTranslatePopupScript() {
  return `
    (function () {
      try {
        if (window.__brachoTrOutside) {
          document.removeEventListener('mousedown', window.__brachoTrOutside, true);
          window.__brachoTrOutside = null;
        }
      } catch (e) {}
      const box = document.getElementById('bracho-translate-popup');
      if (box) box.remove();
      return true;
    })();
  `;
}

module.exports = {
  getSelectionForTranslateScript,
  applyWriteTranslationScript,
  showTranslatePopupScript,
  hideTranslatePopupScript,
};
