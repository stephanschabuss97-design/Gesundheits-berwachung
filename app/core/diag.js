'use strict';
/**
 * MODULE: diagnostics.js
 * Description: Sammelt und verwaltet UI- und Laufzeitdiagnosen, Fehleranzeigen und Performance-Metriken für App-Module.
* Submodules:
*  - namespace init (AppModules.diagnostics)
*  - unhandled rejection sink (globaler Fehler-Listener)
*  - recordPerfStat (Performance-Logger Forwarder)
*  - diag logger (UI-Diagnosemodul)
*  - uiError / uiInfo (visuelle Feedback-Komponenten)
*  - diagnosticsApi export (AppModules.diagnostics + perfStats proxy)
 */

// SUBMODULE: namespace init @internal - Initialisiert globales Diagnostics-Modul
(function (global) {
  const appModules = (global.AppModules = global.AppModules || {});
  const diagnosticsFlag =
    typeof appModules?.config?.DIAGNOSTICS_ENABLED === 'boolean'
      ? appModules.config.DIAGNOSTICS_ENABLED
      : true;
  global.DIAGNOSTICS_ENABLED = diagnosticsFlag;
  // Hinweis: Alle Fallback-Logs laufen über logDiagConsole, damit Tests/QA die Konsole komplett stummschalten können.
  const isDiagnosticsEnabled = !!diagnosticsFlag;
  const logDiagConsole = (level, ...args) => {
    if (global.DIAGNOSTICS_ENABLED === false) return;
    try {
      global.console?.[level]?.(...args);
    } catch (_) {
      /* noop */
    }
  };
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
        const text = String(msg || 'Fehler');
        logDiagConsole('warn', '[diagnostics disabled] uiError:', text);
      },
      uiInfo(msg) {
        const text = String(msg || 'OK');
        logDiagConsole('info', '[diagnostics disabled] uiInfo:', text);
      }
    };
    appModules.diagnostics = diagnosticsApi;
    const hasOwn =
      Object.hasOwn || ((obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop));
    Object.entries({
      diag: stubDiag,
      recordPerfStat: diagnosticsApi.recordPerfStat,
      uiError: diagnosticsApi.uiError,
      uiInfo: diagnosticsApi.uiInfo
    }).forEach(([key, value]) => {
      if (hasOwn(global, key)) {
        return;
      }
      Object.defineProperty(global, key, {
        value,
        writable: false,
        configurable: false,
        enumerable: false
      });
    });
    return;
  }
  const ensureDiagnosticsLayer = () => {
    appModules.diagnosticsLayer = appModules.diagnosticsLayer || {};
    return appModules.diagnosticsLayer;
  };
  const getDiagnosticsLayer = () => appModules.diagnosticsLayer || ensureDiagnosticsLayer();
  ensureDiagnosticsLayer();

  const logToDiagnosticsLayer = (message, context) => {
    const logger = getDiagnosticsLayer().logger;
    try {
      logger?.add?.(message, context);
    } catch (err) {
      logDiagConsole('warn', '[diagnostics] logger forward failed', err);
    }
  };

  const perfForward = (key, startedAt) => {
    const perf = getDiagnosticsLayer().perf;
    try {
      perf?.record?.(key, startedAt);
    } catch (err) {
      logDiagConsole('warn', '[diagnostics] perf forward failed', err);
    }
  };

  const monitor = () => getDiagnosticsLayer().monitor;
  const monitorHeartbeat = (reason) => {
    try {
      monitor()?.heartbeat?.(reason);
    } catch (err) {
      logDiagConsole('warn', '[diagnostics] monitor heartbeat failed', err);
    }
  };
  const monitorToggle = (state) => {
    try {
      monitor()?.toggle?.(state);
    } catch (err) {
      logDiagConsole('warn', '[diagnostics] monitor toggle failed', err);
    }
  };
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
            logDiagConsole('error', '[diagnostics:unhandledrejection]', message);
          }
          e.preventDefault();
        } catch (err) {
          logDiagConsole('error', '[diagnostics] unhandledrejection handler failed', err);
        }
      });
    }
  } catch (err) {
    logDiagConsole('error', '[diagnostics] failed to register unhandledrejection listener', err);
  }

  // SUBMODULE: recordPerfStat @public
  function recordPerfStat(key, startedAt) {
    perfForward(key, startedAt);
  }

  // SUBMODULE: diag logger @public
  const diag = {
    el: null,
    logEl: null,
    open: false,
    lines: [],
    add(msg) {
      logToDiagnosticsLayer(msg, { source: 'diag.add' });
      monitorHeartbeat('diag-add');
      const t = new Date().toLocaleTimeString();
      this.lines.unshift(`[${t}] ${msg}`);
      this.lines = this.lines.slice(0, 80);
      if (this.logEl) {
        this.logEl.textContent = this.lines.join('\n');
      }
    },
    init() {
      try {
        monitorHeartbeat('diag-init');
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
        logDiagConsole('error', '[diagnostics:init] failed', err);
      }
    },
    show() {
      if (!this.el) return;
      monitorToggle(true);
      monitorHeartbeat('diag-open');
      this.el.style.display = 'block';
      const trap = global.AppModules?.uiCore?.focusTrap;
      trap?.activate?.(this.el);
      this.open = true;
    },
    hide() {
      if (!this.el) return;
      monitorToggle(false);
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
      logDiagConsole('error', '[uiError]', text);
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
      logDiagConsole('log', '[uiInfo]', text);
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
        logDiagConsole(
          'warn',
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

  // SUBMODULE: perfStats proxy @internal - reicht Calls an diagnosticsLayer.perf durch
  const perfStatsProxy = Object.freeze({
    add(key, delta) {
      try {
        getDiagnosticsLayer().perf?.addDelta?.(key, delta);
      } catch (err) {
        logDiagConsole('warn', '[diagnostics] perfStatsProxy.add failed', err);
      }
    },
    snap(key) {
      try {
        return getDiagnosticsLayer().perf?.snapshot?.(key) || { count: 0 };
      } catch (err) {
        logDiagConsole('warn', '[diagnostics] perfStatsProxy.snap failed', err);
        return { count: 0 };
      }
    }
  });

  if (!hasOwn(global, 'perfStats')) {
    Object.defineProperty(global, 'perfStats', {
      value: perfStatsProxy,
      writable: false,
      configurable: false,
      enumerable: false
    });
  } else {
    logDiagConsole('warn', '[diagnostics] global perfStats already defined, keeping existing reference');
  }
})(window);
