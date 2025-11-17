'use strict';
/**
 * MODULE: diagnostics.js
 * Description: Sammelt und verwaltet UI- und Laufzeitdiagnosen, Fehleranzeigen und Performance-Metriken für App-Module.
 * Submodules:
 *  - namespace init (AppModules.diagnostics)
 *  - unhandled rejection sink (globaler Fehler-Listener)
 *  - perfStats sampler (Messwertsammlung)
 *  - recordPerfStat (Performance-Logger)
 *  - diag logger (UI-Diagnosemodul)
 *  - uiError / uiInfo (visuelle Feedback-Komponenten)
 *  - diagnosticsApi export (AppModules.diagnostics + readonly perfStats)
 */

// SUBMODULE: namespace init @internal - Initialisiert globales Diagnostics-Modul
(function (global) {
  const appModules = (global.AppModules = global.AppModules || {});
  const isDiagnosticsEnabled =
    typeof appModules?.config?.DIAGNOSTICS_ENABLED === 'boolean'
      ? appModules.config.DIAGNOSTICS_ENABLED
      : true;
  if (!isDiagnosticsEnabled) {
    const stubDiag = {
      el: null,
      logEl: null,
      open: false,
      lines: [],
      add() {},
      init() {},
      show() {},
      hide() {}
    };
    const diagnosticsApi = {
      diag: stubDiag,
      recordPerfStat() {},
      uiError(msg) {
        console.warn('[diagnostics disabled] uiError:', msg);
      },
      uiInfo(msg) {
        console.info('[diagnostics disabled] uiInfo:', msg);
      }
    };
    appModules.diagnostics = diagnosticsApi;
    return;
  }
  let diagnosticsListenerAdded = false;

  const MAX_ALLOWED_DIFF_MS = 60_000; // 1 minute sanity limit for perf samples

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
    const MAX_KEY_LEN = 255;
    let bucketCount = 0;

    const add = (k, ms) => {
      if (typeof ms !== 'number' || !Number.isFinite(ms)) return;

      // key validation with explicit reason
      let reason = null;
      if (typeof k !== 'string') reason = 'non-string';
      else if (k.length === 0) reason = 'empty';
      else if (k.length > MAX_KEY_LEN) reason = `too-long(${k.length}>${MAX_KEY_LEN})`;
      else if (!/^[a-zA-Z0-9_-]+$/.test(k)) reason = 'invalid-format';

      if (reason) {
        console.warn('[perfStats] invalid key skipped:', k, `(reason: ${reason})`);
        return;
      }

      if (!buckets[k] && bucketCount >= MAX_BUCKETS) {
        console.warn('[perfStats] bucket limit reached, discarding key:', k);
        return;
      }

      if (!buckets[k]) {
        buckets[k] = [];
        bucketCount++;
      }

      const arr = buckets[k];
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
      const delta = performance.now() - startedAt;
      if (!Number.isFinite(delta) || delta < 0) {
        console.warn('[perfStats] invalid delta for', key, '→', delta);
        return;
      }
      if (delta > MAX_ALLOWED_DIFF_MS) {
        console.warn('[perfStats] excessive delta for', key, '→', delta, 'ms (skipped)');
        return;
      }

      // no redundant clamping; we already validated non-negative
      perfStats.add(key, delta);
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

  // SUBMODULE: uiError @public - zeigt Fehlermeldung im UI oder Fallback-Console an
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

  // SUBMODULE: uiInfo @public - zeigt Info-/Statusmeldung im UI oder Fallback-Console an
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

// SUBMODULE: diagnosticsApi export @internal - registriert API unter AppModules.diagnostics und legt globale Referenzen an
  const diagnosticsApi = { diag, recordPerfStat, uiError, uiInfo };
  appModules.diagnostics = diagnosticsApi;

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

  // SUBMODULE: perfStats readonly wrapper @internal - stellt lesenden Zugriff für Charts sicher
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
