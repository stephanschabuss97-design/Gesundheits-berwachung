'use strict';
/**
 * MODULE: diagnostics
 * intent: Sammelt UI-/Runtime-Diagnosen, zeigt Fehler an, speist das Touch-Log
 * exports: diag, recordPerfStat, uiError, uiInfo
 * version: 1.1
 * compat: Hybrid (Monolith + window.AppModules)
 * notes: Logik unverändert, aber vollständig gekapselt, safe & AppModules-konform
 */

(function (global) {
  const appModules = (global.AppModules = global.AppModules || {});

  // SUBMODULE: unhandled rejection sink @internal - pipes promise rejections to inline toast
  try {
    global.addEventListener('unhandledrejection', (e) => {
      try {
        const msg =
          'Fehler: ' + (e.reason?.message || e.reason || 'Unbekannter Fehler');
        const box = document.getElementById('err');
        if (box) {
          box.style.display = 'block';
          box.textContent = msg;
        } else {
          console.error('[diagnostics:unhandledrejection]', msg);
        }
        e?.preventDefault?.();
      } catch (err) {
        console.error('[diagnostics] unhandledrejection handler failed', err);
      }
    });
  } catch (err) {
    console.error('[diagnostics] failed to register unhandledrejection listener', err);
  }

  // SUBMODULE: perfStats sampler @internal - records timing buckets for perf telemetry
  const perfStats = (() => {
    const buckets = Object.create(null);
    const MAX_SAMPLES = 500;
    const add = (k, ms) => {
      if (typeof ms !== 'number' || !Number.isFinite(ms)) return;
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

  // SUBMODULE: recordPerfStat @public - logs perf telemetry stats
  function recordPerfStat(key, startedAt) {
    if (startedAt == null) return;
    const hasPerf =
      typeof performance !== 'undefined' && typeof performance.now === 'function';
    if (!hasPerf) return;
    try {
      perfStats?.add?.(key, Math.max(0, performance.now() - startedAt));
      const snap = perfStats?.snap?.(key);
      if (snap && snap.count % 25 === 0) {
        diag.add?.(
          `[perf] ${key} p50=${snap.p50 | 0}ms p90=${snap.p90 | 0}ms p95=${snap.p95 | 0}ms`
        );
      }
    } catch (err) {
      console.error('[diagnostics:recordPerfStat] failed', err);
    }
  }

  // SUBMODULE: diag logger @public - hält Diagnosepanel und Log-Einträge
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

  // SUBMODULE: uiError @public - zeigt REST-/UI-Fehler
  function uiError(msg) {
    const box = document.getElementById('err');
    const text = String(msg || 'Fehler');
    if (box) {
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      box.textContent = text;
      box.style.display = 'block';
      setTimeout(() => {
        box.style.display = 'none';
      }, 5000);
    } else {
      console.error('[uiError]', text);
    }
  }

  // SUBMODULE: uiInfo @public - zeigt Statusmeldungen
  function uiInfo(msg) {
    const box = document.getElementById('err');
    const text = String(msg || 'OK');
    if (box) {
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      box.textContent = text;
      box.style.display = 'block';
      setTimeout(() => {
        box.style.display = 'none';
      }, 2000);
    } else {
      console.log('[uiInfo]', text);
    }
  }

  // Exportfläche
  const diagnosticsApi = { diag, recordPerfStat, uiError, uiInfo };
  appModules.diagnostics = diagnosticsApi;

  // Legacy read-only globals (modern hasOwn)
  const hasOwn = Object.hasOwn
    ? Object.hasOwn
    : (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);

  Object.entries(diagnosticsApi).forEach(([key, value]) => {
    if (!hasOwn(global, key)) {
      Object.defineProperty(global, key, {
        value,
        writable: false,
        configurable: false,
        enumerable: false
      });
    }
  });
})(window);
