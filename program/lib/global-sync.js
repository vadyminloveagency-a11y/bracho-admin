/**
 * Auto-fill Global Sync login form (SPA — selectors are heuristic).
 */
function globalSyncAutofillScript(login, password) {
  const user = JSON.stringify(String(login || ""));
  const pass = JSON.stringify(String(password || ""));
  return `
    (async function () {
      const login = ${user};
      const password = ${pass};
      if (!login || !password) return { ok: false, error: 'no credentials' };

      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

      function setNative(el, value) {
        if (!el) return;
        const tag = String(el.tagName || '').toUpperCase();
        const proto = tag === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) desc.set.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        try {
          el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
        } catch (e) {}
      }

      function findUserInput() {
        const inputs = Array.from(document.querySelectorAll('input'));
        const scored = inputs.map((el) => {
          const type = String(el.type || 'text').toLowerCase();
          if (type === 'password' || type === 'hidden' || type === 'submit' || type === 'button') {
            return { el, score: -1 };
          }
          const blob = (
            type + ' ' + (el.name || '') + ' ' + (el.id || '') + ' ' +
            (el.placeholder || '') + ' ' + (el.autocomplete || '') + ' ' +
            String(el.className || '')
          ).toLowerCase();
          let score = 0;
          if (/email/.test(blob)) score += 8;
          if (/user|login|account|phone/.test(blob)) score += 6;
          if (type === 'email' || type === 'text' || type === 'tel') score += 2;
          if (el.offsetParent === null && el.getClientRects().length === 0) score -= 5;
          return { el, score };
        }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
        return scored[0] && scored[0].el;
      }

      function findPassInput() {
        return document.querySelector('input[type="password"]');
      }

      function findSubmit(form) {
        const root = form || document;
        const buttons = Array.from(root.querySelectorAll('button, input[type="submit"], a'));
        for (const b of buttons) {
          const t = String(b.textContent || b.value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
          const type = String(b.type || '').toLowerCase();
          if (type === 'submit') return b;
          if (/^(log\\s*in|sign\\s*in|войти|вхід|login|submit)$/i.test(t)) return b;
          if (/log\\s*in|sign\\s*in|войти|вхід/.test(t) && t.length < 40) return b;
        }
        return root.querySelector('button[type="submit"], input[type="submit"]');
      }

      // Wait for SPA form to mount.
      let userEl = null;
      let passEl = null;
      for (let i = 0; i < 40; i++) {
        userEl = findUserInput();
        passEl = findPassInput();
        if (userEl && passEl) break;
        await sleep(250);
      }
      if (!userEl || !passEl) {
        return { ok: false, error: 'login form not found', href: location.href };
      }

      // Already filled / already logged in?
      if (!/login|signin|sign-in|auth/i.test(location.pathname + location.hash + location.href)) {
        return { ok: true, skipped: true, reason: 'not on login page', href: location.href };
      }

      setNative(userEl, login);
      setNative(passEl, password);
      await sleep(200);

      const form = passEl.closest('form') || userEl.closest('form');
      const submit = findSubmit(form);
      if (submit) {
        try { submit.click(); } catch (e) {}
      } else if (form) {
        try {
          form.requestSubmit ? form.requestSubmit() : form.submit();
        } catch (e) {}
      } else {
        try {
          passEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          passEl.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
        } catch (e) {}
      }

      return { ok: true, submitted: true, href: location.href };
    })();
  `;
}

module.exports = { globalSyncAutofillScript };
