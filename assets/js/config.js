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

  const configApi = Object.freeze({
    DEV_ALLOW_DEFAULTS
  });

  global.AppModules = global.AppModules || {};
  global.AppModules.config = configApi;
})(typeof window !== 'undefined' ? window : globalThis);
