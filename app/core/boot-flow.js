'use strict';
/**
 * MODULE: boot-flow.js
 * Description: Orchestriert den neuen Bootstrap-Funnel BOOT → AUTH_CHECK → INIT_CORE → INIT_MODULES → INIT_UI → IDLE.
 * Submodules:
 *  - Diagnostics & Constants
 *  - Config-Status Buffer (setConfigStatusSafe)
 *  - Stage Normalisierung & Ordering
 *  - Waiter/Listener & DOM-Binding
 *  - Stage Commit & Hang Timer
 *  - Public API (setStage/whenStage/onStageChange/markFailed)
 *  - Init
 */

(function bootFlowModule(global) {
  /** SUBMODULE: Diagnostics & Constants **/
  const doc = global.document;
  const diag =
    global.AppModules?.diag ||
    global.diag || { add() {} };

  const STAGES = ['BOOT', 'AUTH_CHECK', 'INIT_CORE', 'INIT_MODULES', 'INIT_UI', 'IDLE'];
  const FALLBACK_STAGE_ERROR = 'BOOT_ERROR';
  const STAGE_HANG_TIMEOUT_MS = 15000;
  const stageLabels = {
    BOOT: 'BOOT',
    AUTH_CHECK: 'AUTH CHECK',
    INIT_CORE: 'INIT CORE',
    INIT_MODULES: 'INIT MODULES',
    INIT_UI: 'INIT UI',
    IDLE: 'READY',
    BOOT_ERROR: 'BOOT ERROR'
  };
  const bootErrorState = {
    message: '',
    detail: ''
  };
  const getBootErrorPanel = () => doc?.getElementById('bootErrorPanel');
  const getBootErrorMessageEl = () => doc?.getElementById('bootErrorMessage');
  const getBootErrorDetailEl = () => doc?.getElementById('bootErrorDetail');
  const getBootErrorDiagBtn = () => doc?.getElementById('bootErrorDiagBtn');
  let bootErrorDiagBound = false;
  const ensureBootErrorDiagBinding = () => {
    if (bootErrorDiagBound) return;
    const btn = getBootErrorDiagBtn();
    if (!btn) return;
    bootErrorDiagBound = true;
    btn.addEventListener('click', (event) => {
      event?.preventDefault();
      try {
        const diagPanel =
          global.AppModules?.diag ||
          global.diag ||
          global.AppModules?.diagnostics?.diag;
        diagPanel?.show?.();
      } catch (_) {
        /* noop */
      }
    });
  };
  const setBootErrorState = (message, detail) => {
    bootErrorState.message = message || 'Boot fehlgeschlagen.';
    bootErrorState.detail = detail || '';
  };
  const syncBootErrorPanel = () => {
    const panel = getBootErrorPanel();
    if (!panel) return;
    ensureBootErrorDiagBinding();
    const isError = currentStage === FALLBACK_STAGE_ERROR;
    panel.hidden = !isError;
    panel.setAttribute('aria-hidden', isError ? 'false' : 'true');
    if (!isError) return;
    const msgEl = getBootErrorMessageEl();
    if (msgEl) {
      msgEl.textContent = bootErrorState.message || 'Boot fehlgeschlagen.';
    }
    const detailEl = getBootErrorDetailEl();
    if (detailEl) {
      detailEl.textContent =
        bootErrorState.detail || 'Weitere Details im Touch-Log sehen.';
    }
  };

  /** SUBMODULE: Config-Status Buffer **/
  const pendingConfigStatus = [];
  const setConfigStatusSafe = (msg, tone = 'info') => {
    const supa = global.AppModules?.supabase;
    if (supa?.setConfigStatus) {
      try {
        supa.setConfigStatus(msg, tone);
      } catch (_) {
        /* ignore */
      }
      return;
    }
    pendingConfigStatus.push([msg, tone]);
  };
  const flushPendingConfigStatus = () => {
    if (!pendingConfigStatus.length) return;
    const supa = global.AppModules?.supabase;
    if (!supa?.setConfigStatus) return;
    while (pendingConfigStatus.length) {
      const [msg, tone] = pendingConfigStatus.shift();
      try {
        supa.setConfigStatus(msg, tone);
      } catch (_) {
        /* ignore */
      }
    }
  };
  doc?.addEventListener('supabase:ready', flushPendingConfigStatus, { once: false });

  /** SUBMODULE: Stage Normalisierung & Ordering **/
  const normalizeStage = (value) => {
    if (!value && value !== 0) return 'BOOT';
    const upper = String(value).trim().replace(/[\s-]+/g, '_').toUpperCase();
    if (STAGES.includes(upper)) return upper;
    if (upper === FALLBACK_STAGE_ERROR) return FALLBACK_STAGE_ERROR;
    return 'BOOT';
  };

  const stageOrder = (value) => {
    const upper = normalizeStage(value);
    const idx = STAGES.indexOf(upper);
    return idx === -1 ? STAGES.length : idx;
  };

  /** SUBMODULE: Waiter/Listener & DOM-Binding **/
  const waiters = new Map();
  const stageListeners = new Set();
  const getBody = () => doc?.body || doc?.documentElement;

  let currentStage = normalizeStage(doc?.body?.dataset?.bootStage || 'BOOT');
  let hangTimer = null;
  let hangOrigin = null;

  const updateDom = () => {
    const body = getBody();
    if (body) {
      body.dataset.bootStage = currentStage.toLowerCase();
      body.setAttribute('aria-busy', currentStage === 'IDLE' ? 'false' : 'true');
    }
    const labelEl = doc?.querySelector('[data-boot-stage-label]');
    if (labelEl) {
      labelEl.textContent = stageLabels[currentStage] || currentStage;
    }
    syncBootErrorPanel();
  };

  const flushWaiters = () => {
    waiters.forEach((callbacks, target) => {
      if (stageOrder(currentStage) >= stageOrder(target)) {
        callbacks.splice(0).forEach((cb) => {
          try {
            cb(currentStage);
          } catch (_) {
            /* noop */
          }
        });
        waiters.delete(target);
      }
    });
  };

  const notifyStageListeners = (nextStage, prevStage) => {
    stageListeners.forEach((listener) => {
      try {
        listener(nextStage, prevStage);
      } catch (err) {
        diag.add?.(`[boot] stage listener error: ${err?.message || err}`);
      }
    });
  };

  /** SUBMODULE: Stage Commit & Hang Timer **/
  const startHangTimer = (stage) => {
    if (hangTimer) {
      clearTimeout(hangTimer);
      hangTimer = null;
    }
    if (stage === 'IDLE' || stage === FALLBACK_STAGE_ERROR) return;
    hangOrigin = stage;
    hangTimer = setTimeout(() => {
      diag.add?.(`[boot] stage timeout @ ${hangOrigin}`);
      const timeoutMessage = 'Boot hängt, bitte neu laden.';
      setBootErrorState(timeoutMessage, `Phase ${hangOrigin} reagiert nicht.`);
      setConfigStatusSafe(timeoutMessage, 'error');
      commitStage(FALLBACK_STAGE_ERROR, { reason: 'timeout' });
    }, STAGE_HANG_TIMEOUT_MS);
  };

  const commitStage = (nextStage, options = {}) => {
    const normalized = normalizeStage(nextStage);
    if (normalized === currentStage) return currentStage;
    const prevStage = currentStage;
    const reasonStr = options.reason ? ` (${options.reason})` : '';
    currentStage = normalized;
    if (normalized === FALLBACK_STAGE_ERROR && !bootErrorState.message) {
      setBootErrorState('Boot fehlgeschlagen.', '');
    }
    diag.add?.(`[boot] stage ${prevStage} -> ${normalized}${reasonStr}`);
    updateDom();
    startHangTimer(normalized);
    flushWaiters();
    notifyStageListeners(normalized, prevStage);
    return currentStage;
  };

  /** SUBMODULE: Public API **/
  const setStage = (nextStage) => commitStage(nextStage, { isExternal: true });

  const whenStage = (targetStage, callback) => {
    const target = normalizeStage(targetStage);
    if (stageOrder(currentStage) >= stageOrder(target)) {
      try {
        callback(currentStage);
      } catch (_) {
        /* noop */
      }
      return () => {};
    }
    if (!waiters.has(target)) waiters.set(target, []);
    const list = waiters.get(target);
    list.push(callback);
    return () => {
      const idx = list.indexOf(callback);
      if (idx !== -1) list.splice(idx, 1);
    };
  };

  const onStageChange = (callback) => {
    if (typeof callback !== 'function') return () => {};
    stageListeners.add(callback);
    return () => stageListeners.delete(callback);
  };

  const bootFlowApi = {
    getStage: () => currentStage,
    getStages: () => [...STAGES],
    getStageIndex: stageOrder,
    setStage,
    whenStage,
    onStageChange,
    isStageAtLeast: (stage) => stageOrder(currentStage) >= stageOrder(stage),
    report: setConfigStatusSafe,
    getLastError: () => ({ ...bootErrorState }),
    markFailed: (message = 'Boot fehlgeschlagen.', detail = '') => {
      setBootErrorState(message, detail);
      setConfigStatusSafe(message, 'error');
      return commitStage(FALLBACK_STAGE_ERROR, { reason: 'manual-fail' });
    }
  };

  global.AppModules = global.AppModules || {};
  global.AppModules.bootFlow = bootFlowApi;

  /** SUBMODULE: Init **/
  const initialize = () => {
    updateDom();
    startHangTimer(currentStage);
    if (doc?.readyState === 'loading') {
      doc.addEventListener(
        'DOMContentLoaded',
        () => {
          updateDom();
          flushPendingConfigStatus();
        },
        { once: true }
      );
    } else {
      flushPendingConfigStatus();
    }
  };

  initialize();
})(typeof window !== 'undefined' ? window : globalThis);
