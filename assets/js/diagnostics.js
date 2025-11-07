'use strict';
/**
 * MODULE: diagnostics
 * intent: Sammelt UI-/Runtime-Diagnosen, zeigt Fehler an, speist das Touch-Log
 * exports: diag, recordPerfStat, uiError, uiInfo
 * version: 1.5.1
 * compat: Hybrid (Monolith + window.AppModules)
 * notes: perfStats read-only Exposure (snap-only) + non-writable global property
 */

(function (global) {
  const appModules = (global.AppModules = global.AppModules || {});
  let diagnosticsListenerAdded = false;

  // SUBMODULE: unhandled rejection sink @internal
  try {
    if (!diagnosticsListenerAdded) {
      diagnosticsListenerAdded = true;
      global.addEventListener('unhandledrejection', (e) => {
        try {
          const errBox =
            document.getElementById('errBox') || document.getElementById('err');
          const message =
            'Fehler: ' + (e.reason?.message || e.reason || 'Unbekannter Fehler');

          if (errBox) {
            errBox.style.display = 'block';
            errBox.textContent = message;
          } else {
            console.error('[diagnostics:unhandledrejection]', message);
          }
          e.preventDefault();
        } catch (err) {
          console.error('[diagnostics] unhandledrejection handler failed', err);
        }
      });
    }
  } catch (err) {
    console.error('[diagnostics] failed to register unhandledrejection listener', err);
  }

  // SUBMODULE: perfStats sampler @internal
  const perfStats = (() => {
    const buckets = Object.create(null);
    const MAX_SAMPLES = 500;
    const MAX_BUCKETS = 50;

    const add = (k, ms) => {
      if (typeof ms !== 'number' || !Number.isFinite(ms)) return;
      if (typeof k !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(k)) return;
      if (!buckets[k] && Object.keys(buckets).length >= MAX_BUCKETS) return;

      const arr = (buckets[k] ??= []);
      arr.push(ms);
      if (arr.length >= MAX_SAMPLES) arr.shift();
    };

    const pct = (arr, p) => {
      if (!arr.length) return 0;
      const sorted = [...arr].sort((x, y) => x - y);
      const i = Math.ceil((p / 100) * sorted.length) - 1;
      return sorted[Math.max(0, Math.min(i, sorted.length - 1))];
    };

    const snap = (k) => {
      const arr = buckets[k] || [];
      return {
        count: arr.length,
        p50: pct(arr, 50),
        p90: pct(arr, 90),
        p95: pct(arr, 95),
        p99: pct(arr, 99)
      };
    };

    return { add, snap };
  })();

  // SUBMODULE: recordPerfStat @public
  function recordPerfStat(key, startedAt) {
    if (startedAt == null) return;
    const hasPerf =
      typeof performance !== 'undefined' && typeof performance.now === 'function';
    if (!hasPerf) return;
    try {
      perfStats.add(key, Math.max(0, performance.now() - startedAt));
      const snap = perfStats.snap(key);
      if (snap && snap.count % 25 === 0) {
        diag.add?.(
          `[perf] ${key} p50=${Math.floor(snap.p50 || 0)}ms ` +
            `p90=${Math.floor(snap.p90 || 0)}ms p95=${Math.floor(snap.p95 || 0)}ms`
        );
      }
    } catch (err) {
      console.error('[diagnostics:recordPerfStat] failed', err);
    }
  }

  // SUBMODULE: diag logger @public
  const diag = {
    el: null,
    logEl: null,
    open: false,
    lines: [],
    add(msg) {
      const t = new Date().toLocaleTimeString();
      this.lines.unshift(`[${t}] ${msg}`);
      this.lines = this.lines.slice(0, 80);
      if (this.logEl) {
        this.logEl.textContent = this.lines.join('\n');
      }
    },
    init() {
      try {
        this.el = document.getElementById('diag');
        this.logEl = document.getElementById('diagLog');
        if (this.logEl && this.lines.length) {
          this.logEl.textContent = this.lines.join('\n');
        }
        const t1 = document.getElementById('diagToggle');
        const t2 = document.getElementById('diagToggleFab');
        const close = document.getElementById('diagClose');
        const toggle = () => {
          this.open = !this.open;
          this.open ? this.show() : this.hide();
        };
        if (t1) t1.addEventListener('click', toggle);
        if (t2) t2.addEventListener('click', toggle);
        if (close) close.addEventListener('click', () => this.hide());
      } catch (err) {
        console.error('[diagnostics:init] failed', err);
      }
    },
    show() {
      if (!this.el) return;
      this.el.style.display = 'block';
      const trap = global.AppModules?.uiCore?.focusTrap;
      trap?.activate?.(this.el);
      this.open = true;
    },
    hide() {
      if (!this.el) return;
      this.el.style.display = 'none';
      const trap = global.AppModules?.uiCore?.focusTrap;
      trap?.deactivate?.();
      this.open = false;
    }
  };

  // SUBMODULE: uiError @public
  function uiError(msg) {
    const errBox =
      document.getElementById('errBox') || document.getElementById('err');
    const text = String(msg || 'Fehler');
    if (errBox) {
      errBox.setAttribute('role', 'alert');
      errBox.setAttribute('aria-live', 'assertive');
      errBox.textContent = text;
      errBox.style.display = 'block';
      setTimeout(() => {
        errBox.style.display = 'none';
      }, 5000);
    } else {
      console.error('[uiError]', text);
    }
  }

  // SUBMODULE: uiInfo @public
  function uiInfo(msg) {
    const infoBox = document.getElementById('infoBox');
    const text = String(msg || 'OK');
    if (infoBox) {
      infoBox.setAttribute('role', 'status');
      infoBox.setAttribute('aria-live', 'polite');
      infoBox.textContent = text;
      infoBox.style.display = 'block';
      setTimeout(() => {
        infoBox.style.display = 'none';
      }, 2000);
    } else {
      console.log('[uiInfo]', text);
    }
  }

  // Exportfläche
  const diagnosticsApi = { diag, recordPerfStat, uiError, uiInfo };
  appModules.diagnostics = diagnosticsApi;

  // Legacy read-only globals (modern hasOwn, warn on conflict)
  const hasOwn = Object.hasOwn
    ? Object.hasOwn
    : (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);

  Object.entries(diagnosticsApi).forEach(([key, value]) => {
    if (hasOwn(global, key)) {
      console.warn(
        `[diagnostics] global property conflict: '${key}' already defined as ${typeof global[key]}`
      );
      return;
    }
    Object.defineProperty(global, key, {
      value,
      writable: false,
      configurable: false,
      enumerable: false
    });
  });

  // ✅ Safe global export: readonly wrapper for chart compatibility
  if (!hasOwn(global, 'perfStats')) {
    const ro = Object.freeze({ snap: (key) => perfStats.snap(key) });
    Object.defineProperty(global, 'perfStats', {
      value: ro,
      writable: false,
      configurable: false,
      enumerable: false
    });
  } else {
    console.warn('[diagnostics] global perfStats already defined, keeping existing reference');
  }
})(window);
