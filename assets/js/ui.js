'use strict';
/**
 * MODULE: uiCore
 * intent: Kapselt UI-Helfer (Help-Panel, Debounce, Focus-Trap, Underlay-Inert) aus dem Monolith-Inline-Skript
 * exports: helpPanel, debounce, setUnderlayInert, focusTrap
 * version: 1.1
 * compat: Hybrid (Monolith + window.AppModules), Legacy-Global-Shims read-only
 * notes: Verhalten beibehalten; nur Guards, Kapselung, Header-Standard und Export gehärtet.
 */

(function (global) {
  // namespace setup
  const MODULE_NAME = 'uiCore';
  const appModules = (global.AppModules = global.AppModules || {});

  // SUBMODULE: help-panel overlay @internal - toggles inline support dialog
  const helpPanel = {
    el: null,
    open: false,

    init() {
      this.el = global.document.getElementById('help');
      this.open = false;

      const t1 = global.document.getElementById('helpToggle');
      const t2 = global.document.getElementById('helpToggleFab');
      const close = global.document.getElementById('helpClose');

      const toggle = () => {
        this.open = !this.open;
        if (this.open) this.show();
        else this.hide();
      };

      // Guards: Listener nur registrieren, wenn Ziel existiert
      if (t1 && typeof t1.addEventListener === 'function') {
        t1.addEventListener('click', toggle);
      }
      if (t2 && typeof t2.addEventListener === 'function') {
        t2.addEventListener('click', toggle);
      }
      if (close && typeof close.addEventListener === 'function') {
        close.addEventListener('click', () => this.hide());
      }
    },

    show() {
      if (!this.el) return;
      this.el.style.display = 'block';
      focusTrap.activate(this.el);
      this.open = true;
    },

    hide() {
      if (!this.el) return;
      this.el.style.display = 'none';
      focusTrap.deactivate();
      this.open = false;
    }
  };

  /* ===== Utils ===== */
  // SUBMODULE: debounce util @internal - debounces high-frequency UI updates
  function debounce(fn, ms = 150) {
    let timer = null;
    return (...args) => {
      if (timer) global.clearTimeout(timer);
      timer = global.setTimeout(() => {
        timer = null;
        fn(...args);
      }, ms);
    };
  }

  // SUBMODULE: setUnderlayInert @internal - disables background while modal active
  function setUnderlayInert(active, exceptEl = null) {
    try {
      const d = global.document;
      const targets = [
        d.querySelector('header'),
        d.querySelector('nav.tabs'),
        d.getElementById('appMain'),
        d.querySelector('.fab-wrap')
      ].filter(Boolean);

      targets.forEach((el) => {
        if (!el) return;

        if (active) {
          if (
            exceptEl &&
            (el === exceptEl || el.contains(exceptEl) || exceptEl.contains(el))
          ) {
            return;
          }

          // vorheriges aria-hidden speichern
          if (!el.hasAttribute('data-prev-aria-hidden')) {
            const prev = el.getAttribute('aria-hidden');
            el.setAttribute('data-prev-aria-hidden', prev == null ? '' : prev);
          }

          el.setAttribute('aria-hidden', 'true');

          if (!el.hasAttribute('data-inert-applied')) {
            el.setAttribute('data-inert-applied', '1');
          }
          // Attribut-basierter inert-Fallback; echte .inert-Unterstützung ist nicht überall vorhanden
          el.setAttribute('inert', '');
        } else {
          // ursprüngliches aria-hidden wiederherstellen
          if (el.hasAttribute('data-prev-aria-hidden')) {
            const prev = el.getAttribute('data-prev-aria-hidden');
            if (prev === '') el.removeAttribute('aria-hidden');
            else el.setAttribute('aria-hidden', prev);
            el.removeAttribute('data-prev-aria-hidden');
          } else {
            el.removeAttribute('aria-hidden');
          }

          if (el.hasAttribute('data-inert-applied')) {
            el.removeAttribute('inert');
            el.removeAttribute('data-inert-applied');
          }
        }
      });
    } catch (_) {
      /* noop */
    }
  }

  // SUBMODULE: focus-trap @internal - traps tab focus inside modal overlays
  const focusTrap = {
    // stack of { root, lastFocus, prevTabIndex }
    stack: [],

    // shared global handler that always operates on the current top of stack
    globalHandler(e) {
      if (e.key !== 'Tab') return;

      const top = focusTrap.stack[focusTrap.stack.length - 1];
      if (!top) return;

      const root = top.root;
      const items = focusTrap.getFocusable(root);

      if (!items.length) {
        e.preventDefault();
        if (typeof root.focus === 'function') root.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && global.document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && global.document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },

    getFocusable(root) {
      const selector =
        'a[href], button:not([disabled]), input:not([disabled]), ' +
        'select:not([disabled]), textarea:not([disabled]), ' +
        '[tabindex]:not([tabindex="-1"])';

      return Array.from(root.querySelectorAll(selector)).filter((el) => {
        // Sichtbarkeit prüfen
        const style = global.getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') return false;
        return el.getClientRects().length > 0;
      });
    },

    activate(root) {
      if (!root) return;

      // wenn bereits Top, nichts tun
      const top = this.stack[this.stack.length - 1];
      if (top && top.root === root) return;

      // vorhandene Instanz (nicht Top) entfernen um sie neu zu pushen
      const existing = this.stack.findIndex((e) => e.root === root);
      if (existing !== -1) this.stack.splice(existing, 1);

      const d = global.document;
      const lastFocus = d.activeElement || null;
      const prevTabIndex = root.hasAttribute('tabindex')
        ? root.getAttribute('tabindex')
        : null;

      if (prevTabIndex === null) root.setAttribute('tabindex', '-1');

      // markiere modal
      root.setAttribute('aria-modal', 'true');

      // Metadaten pushen
      this.stack.push({ root, lastFocus, prevTabIndex });

      // globalen Handler nur einmal registrieren
      if (this.stack.length === 1) {
        d.addEventListener('keydown', this.globalHandler, true);
      }

      // erstes fokussierbares Element anvisieren
      const items = this.getFocusable(root);
      (items[0] || root).focus();

      // Unterlage inert setzen (außer dem aktiven Root)
      setUnderlayInert(true, root);
    },

    deactivate() {
      if (!this.stack.length) return;

      // obersten Eintrag poppen und Zustand restaurieren
      const top = this.stack.pop();
      const { root, lastFocus, prevTabIndex } = top;

      try {
        root.setAttribute('aria-modal', 'false');
      } catch (_) {}

      if (prevTabIndex === null) root.removeAttribute('tabindex');
      else root.setAttribute('tabindex', prevTabIndex);

      if (lastFocus && typeof lastFocus.focus === 'function') {
        try {
          lastFocus.focus();
        } catch (_) {}
      }

      const d = global.document;

      if (this.stack.length === 0) {
        // keine Overlays mehr: Handler entfernen, Unterlage freigeben
        d.removeEventListener('keydown', this.globalHandler, true);
        setUnderlayInert(false);
        return;
      }

      // neues Top setzen
      const newTop = this.stack[this.stack.length - 1];
      try {
        newTop.root.setAttribute('aria-modal', 'true');
      } catch (_) {}
      setUnderlayInert(true, newTop.root);
    }
  };

  // Exportfläche
  const uiCoreApi = { helpPanel, debounce, setUnderlayInert, focusTrap };
  appModules[MODULE_NAME] = uiCoreApi;

  // Legacy-Shims: für Monolith-Code, der direkt auf window.<name> zugreift.
  // Nur setzen, wenn nicht bereits vorhanden (keine Überschreibung, read-only).
  ['helpPanel', 'debounce', 'setUnderlayInert', 'focusTrap'].forEach((k) => {
    if (!Object.prototype.hasOwnProperty.call(global, k)) {
      Object.defineProperty(global, k, {
        value: uiCoreApi[k],
        writable: false,
        configurable: true,
        enumerable: false
      });
    }
  });
})(window);
