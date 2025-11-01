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

// Focus trap with a simple stack to support nested overlays
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
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  },

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

  activate(root) {
    if (!root) return;
    // if already the top, nothing to do
    const top = this.stack[this.stack.length - 1];
    if (top && top.root === root) return;

    // if root already in stack (not top), remove it first to re-push as top
    const existing = this.stack.findIndex(e => e.root === root);
    if (existing !== -1) this.stack.splice(existing, 1);

    const lastFocus = document.activeElement || null;
    const prevTabIndex = root.hasAttribute('tabindex') ? root.getAttribute('tabindex') : null;
    if (prevTabIndex === null) root.setAttribute('tabindex', '-1');
    // mark this root as modal
    root.setAttribute('aria-modal', 'true');

    // push metadata
    this.stack.push({ root, lastFocus, prevTabIndex });

    // install global handler when first overlay pushed
    if (this.stack.length === 1) {
      document.addEventListener('keydown', this.globalHandler, true);
    }

    // focus first focusable element
    const items = this.getFocusable(root);
    (items[0] || root).focus();

    // set inert on underlay except the current top
    setUnderlayInert(true, root);
  },

  deactivate() {
    if (!this.stack.length) return;
    // pop the top entry and restore its state
    const top = this.stack.pop();
    const { root, lastFocus, prevTabIndex } = top;
    try { root.setAttribute('aria-modal', 'false'); } catch (_) {}
    if (prevTabIndex === null) root.removeAttribute('tabindex');
    else root.setAttribute('tabindex', prevTabIndex);
    // restore focus to what was focused before this overlay
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus(); } catch (_) {}
    }

    if (this.stack.length === 0) {
      // no overlays left: remove handler and clear inert
      document.removeEventListener('keydown', this.globalHandler, true);
      setUnderlayInert(false);
      return;
    }

    // there is a new top overlay: ensure inert applies to it and mark modal
    const newTop = this.stack[this.stack.length - 1];
    try { newTop.root.setAttribute('aria-modal', 'true'); } catch (_) {}
    setUnderlayInert(true, newTop.root);
  }
};
