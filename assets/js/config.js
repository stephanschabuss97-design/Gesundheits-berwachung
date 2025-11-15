'use strict';
/**
 * MODULE: config.js
 * Description: Definiert globale Laufzeitkonstanten (Dev-Flags, Konfigurationsstatus).
 * Submodules:
 *  - DEV_ALLOW_DEFAULTS (Entwickler-Toggle)
 *  - configApi export (AppModules.config)
 */

(function (global) {
  const DEV_ALLOW_DEFAULTS =
    /^(localhost|127\.0\.0\.1|.*\.local)$/i.test(global?.location?.hostname || '');

  const readTrendPilotFlag = () => {
    if (typeof global?.TREND_PILOT_ENABLED === 'boolean') return global.TREND_PILOT_ENABLED;
    try {
      const lsValue = global?.localStorage?.getItem('TREND_PILOT_ENABLED');
      if (lsValue != null) return lsValue === 'true' || lsValue === '1';
    } catch (_) {
      /* ignore */
    }
    const attr = global?.document?.body?.dataset?.trendPilotEnabled;
    if (attr != null) return attr === 'true' || attr === '1';
    return false;
  };

  const TREND_PILOT_ENABLED = readTrendPilotFlag();

  const configApi = Object.freeze({
    DEV_ALLOW_DEFAULTS,
    TREND_PILOT_ENABLED
  });

  global.AppModules = global.AppModules || {};
  global.AppModules.config = configApi;
})(typeof window !== 'undefined' ? window : globalThis);
