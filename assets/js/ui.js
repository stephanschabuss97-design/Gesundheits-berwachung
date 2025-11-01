/**
 * MODULE: UI CORE
 * intent: kapselt Hilfspanele, Fokusfalle und UI-Helfer vom Inline-Script
 * exports: helpPanel, debounce, setUnderlayInert, focusTrap
 * notes: Logik unveraendert aus index.html extrahiert
 */

/* ===== Help panel ===== */
const helpPanel = {
  el: null,
  open: false,
  init() {
    this.el = document.getElementById('help');
    this.open = false;
    const t1 = document.getElementById('helpToggle');
    const t2 = document.getElementById('helpToggleFab');
    const close = document.getElementById('helpClose');
    const toggle = () => {
      this.open = !this.open;
      if (this.open) {
        this.show();
      } else {
        this.hide();
      }
    };
    t1.addEventListener('click', toggle);
    if (t2) t2.addEventListener('click', toggle);
    close.addEventListener('click', () => {
      this.hide();
    });
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
function debounce(fn, ms = 150) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  };
}

function setUnderlayInert(active, exceptEl = null) {
  try {
    const targets = [
      document.querySelector('header'),
      document.querySelector('nav.tabs'),
      document.getElementById('appMain'),
      document.querySelector('.fab-wrap')
    ].filter(Boolean);

    targets.forEach(el => {
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

// Simple focus trap for modal overlays
const focusTrap = {
  current: null,
  lastFocus: null,
  handler: null,
  prevTabIndex: null,
  getFocusable(root) {
    return Array.from(
      root.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), ' +
          'select:not([disabled]), textarea:not([disabled]), ' +
          '[tabindex]:not([tabindex="-1"])'
      )
    ).filter(el => {
      const style = window.getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') return false;
      return el.getClientRects().length > 0;
    });
  },
  onKeyDown(e) {
    if (e.key !== 'Tab') return;
    const root = focusTrap.current;
    if (!root) return;
    const items = focusTrap.getFocusable(root);
    if (!items.length) {
      e.preventDefault();
      if (typeof root.focus === 'function') root.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  },
  activate(root) {
    if (!root) return;
    if (this.current === root) return;
    this.deactivate();
    this.current = root;
    this.lastFocus = document.activeElement || null;
    this.prevTabIndex = root.hasAttribute('tabindex')
      ? root.getAttribute('tabindex')
      : null;
    if (this.prevTabIndex === null) root.setAttribute('tabindex', '-1');
    root.setAttribute('aria-modal', 'true');
    this.handler = this.onKeyDown.bind(this);
    document.addEventListener('keydown', this.handler, true);
    const items = this.getFocusable(root);
    (items[0] || root).focus();
    setUnderlayInert(true, root);
  },
  deactivate() {
    const root = this.current;
    if (!root) return;
    root.setAttribute('aria-modal', 'false');
    if (this.handler) document.removeEventListener('keydown', this.handler, true);
    setUnderlayInert(false);
    if (this.prevTabIndex === null) root.removeAttribute('tabindex');
    else root.setAttribute('tabindex', this.prevTabIndex);
    const last = this.lastFocus;
    this.current = null;
    this.lastFocus = null;
    this.handler = null;
    this.prevTabIndex = null;
    if (last && typeof last.focus === 'function') last.focus();
  }
};
