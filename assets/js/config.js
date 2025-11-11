'use strict';
/**
 * MODULE: config.js
 * Description: Definiert globale Laufzeitkonstanten (Dev-Flags, Konfigurationsstatus).
 * Submodules:
 *  - DEV_ALLOW_DEFAULTS (Entwickler-Toggle)
 *  - configApi export (AppModules.config)
 *  - legacy globals bridge
 */

(function (global) {
  const DEV_ALLOW_DEFAULTS =
    /^(localhost|127\.0\.0\.1|.*\.local)$/i.test(global?.location?.hostname || '');

  const configApi = {
    DEV_ALLOW_DEFAULTS
  };

  global.AppModules = global.AppModules || {};
  global.AppModules.config = configApi;

  Object.entries(configApi).forEach(([name, value]) => {
    if (!(name in global)) {
      Object.defineProperty(global, name, {
        configurable: true,
        writable: false,
        value
      });
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
