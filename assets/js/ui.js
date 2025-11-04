'use strict';
/**
 * MODULE: uiCore
 * intent: Kapselt UI-Helfer (Help-Panel, Debounce, Focus-Trap, Underlay-Inert) aus dem Monolith-Inline-Skript
 * exports: helpPanel, debounce, setUnderlayInert, focusTrap
 * version: 1.3
 * compat: Hybrid (Monolith + window.AppModules), Legacy-Global-Shims read-only
 * notes: Verhalten beibehalten; Coderabbit Fixes (focus safety, cache, scoped observer)
 */

(function (global) {
  const MODULE_NAME = 'uiCore';
  const appModules = (global.AppModules = global.AppModules || {});

  // SUBMODULE: help-panel overlay @internal - toggles inline support dialog
  const helpPanel = {
    el: null,
    open: false,

    init() {
      const el = global.document.getElementById('help');
      if (!el) {
        console.warn('[uiCore:helpPanel] Missing element with id="help" — panel init skipped.');
        return;
      }
      this.el = el;
      this.open = false;

      const t1 = global.document.getElementById('helpToggle');
      const t2 = global.document.getElementById('helpToggleFab');
      const close = global.document.getElementById('helpClose');

      const toggle = () => {
        this.open = !this.open;
        if (this.open) this.show();
        else this.hide();
      };

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
          if (!el.hasAttribute('data-prev-aria-hidden')) {
            const prev = el.getAttribute('aria-hidden');
            el.setAttribute('data-prev-aria-hidden', prev == null ? '' : prev);
          }
          el.setAttribute('aria-hidden', 'true');
          if (!el.hasAttribute('data-inert-applied')) {
            el.setAttribute('data-inert-applied', '1');
          }
          el.setAttribute('inert', '');
        } else {
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
  const focusTrap = (() => {
    const cache = new WeakMap(); // cached focusable elements per root
    const observers = new WeakMap(); // root -> MutationObserver

    const self = {
      stack: [],

      globalHandler(e) {
        if (e.key !== 'Tab') return;
        const top = self.stack[self.stack.length - 1];
        if (!top) return;

        const root = top.root;
        const items = self.getFocusable(root);

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

      getFocusable(root, refresh = false) {
        if (!refresh && cache.has(root)) return cache.get(root);

        const selector =
          'a[href], button:not([disabled]), input:not([disabled]), ' +
          'select:not([disabled]), textarea:not([disabled]), ' +
          '[tabindex]:not([tabindex="-1"])';

        const items = Array.from(root.querySelectorAll(selector)).filter(
          (el) => el.offsetParent !== null
        );

        cache.set(root, items);
        return items;
      },

      observeRoot(root) {
        if (observers.has(root)) return;
        const mo = new global.MutationObserver((mutations) => {
          for (const m of mutations) {
            let node = m.target;
            while (node && !cache.has(node)) {
              node = node.parentElement;
            }
            if (node && cache.has(node)) {
              cache.delete(node);
            }
          }
        });
        mo.observe(root, { childList: true, subtree: true });
        observers.set(root, mo);
      },

      unobserveRoot(root) {
        const mo = observers.get(root);
        if (mo) {
          try {
            mo.disconnect();
          } catch (_) {}
          observers.delete(root);
        }
      },

      activate(root) {
        if (!root) return;
        const top = self.stack[self.stack.length - 1];
        if (top && top.root === root) return;

        const existing = self.stack.findIndex((e) => e.root === root);
        if (existing !== -1) self.stack.splice(existing, 1);

        const d = global.document;
        const lastFocus = d.activeElement || null;
        const prevTabIndex = root.hasAttribute('tabindex')
          ? root.getAttribute('tabindex')
          : null;

        if (prevTabIndex === null) root.setAttribute('tabindex', '-1');
        root.setAttribute('aria-modal', 'true');

        self.stack.push({ root, lastFocus, prevTabIndex });

        if (self.stack.length === 1) {
          d.addEventListener('keydown', self.globalHandler, true);
        }

        // safer focus handling
        const items = self.getFocusable(root);
        const target = items[0] || root;
        if (target && typeof target.focus === 'function') {
          try {
            target.focus();
          } catch (_) {}
        }

        // observe root-specific changes
        self.observeRoot(root);
        setUnderlayInert(true, root);
      },

      deactivate() {
        if (!self.stack.length) return;
        const top = self.stack.pop();
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

        // stop observing root when closed
        self.unobserveRoot(root);

        const d = global.document;
        if (self.stack.length === 0) {
          d.removeEventListener('keydown', self.globalHandler, true);
          setUnderlayInert(false);
          return;
        }

        const newTop = self.stack[self.stack.length - 1];
        try {
          newTop.root.setAttribute('aria-modal', 'true');
        } catch (_) {}
        setUnderlayInert(true, newTop.root);
      }
    };

    return self;
  })();

  const uiCoreApi = { helpPanel, debounce, setUnderlayInert, focusTrap };
  appModules[MODULE_NAME] = uiCoreApi;

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
