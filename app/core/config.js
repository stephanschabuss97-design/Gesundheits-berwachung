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

  const parseBoolean = (value) => {
    if (value == null) return null;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return null;
  };

  const readTrendPilotFlag = () => {
    if (typeof global?.TREND_PILOT_ENABLED === 'boolean') return global.TREND_PILOT_ENABLED;
    try {
      const lsValue = global?.localStorage?.getItem('TREND_PILOT_ENABLED');
      const parsedLs = parseBoolean(lsValue);
      if (parsedLs != null) return parsedLs;
    } catch (_) {
      /* ignore */
    }
    const attr = parseBoolean(global?.document?.body?.dataset?.trendPilotEnabled);
    if (attr != null) return attr;
    return true;
  };

  const TREND_PILOT_ENABLED = readTrendPilotFlag();

  const configApi = Object.freeze({
    DEV_ALLOW_DEFAULTS,
    TREND_PILOT_ENABLED
  });

  global.AppModules = global.AppModules || {};
  global.AppModules.config = configApi;
})(typeof window !== 'undefined' ? window : globalThis);
