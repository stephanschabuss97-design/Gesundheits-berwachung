'use strict';
/**
 * MODULE: config.js
 * Description: Definiert globale Laufzeitkonstanten und Zustände (Dev-Flags, Terminrollen, Konfigurationsstatus).
 * Submodules:
 *  - DEV_ALLOW_DEFAULTS (Entwickler-Toggle)
 *  - APPOINTMENT_GRACE_MS (Zeit-Toleranz für Arzttermine)
 *  - APPOINTMENT_ROLES (Terminrollen-Definition)
 *  - appointmentsState (Status-Objekt)
 *  - configApi export (AppModules.config)
 *  - legacy globals bridge
 */

// SUBMODULE: namespace init @internal - kapselt globale Laufzeitkonfiguration
(function (global) {

   // SUBMODULE: DEV_ALLOW_DEFAULTS @internal - erlaubt lokale Defaults für Entwicklungsumgebungen
  const DEV_ALLOW_DEFAULTS =
    /^(localhost|127\.0\.0\.1|.*\.local)$/i.test(global?.location?.hostname || '');

      // SUBMODULE: APPOINTMENT_GRACE_MS @internal - Toleranzzeitfenster für Termin-Erkennung
  const APPOINTMENT_GRACE_MS = 5 * 60 * 1000;

  // SUBMODULE: APPOINTMENT_ROLES @internal - definierte Arztrollen für Terminlogik
  const APPOINTMENT_ROLES = [
    { code: 'nephro', label: 'Nephrologe' },
    { code: 'internal', label: 'Internist' },
    { code: 'urology', label: 'Urologe' },
    { code: 'dentist', label: 'Zahnarzt' },
    { code: 'ophtha', label: 'Augenarzt' },
    { code: 'physio', label: 'Physiotherapie' }
  ];

    // SUBMODULE: appointmentsState @internal - globaler Statusspeicher für Termin-Cache
  const appointmentsState = {
    data: Object.create(null),
    loading: false,
    loaded: false,
    next: null
  };

  const configApi = {
    DEV_ALLOW_DEFAULTS,
    APPOINTMENT_GRACE_MS,
    APPOINTMENT_ROLES,
    appointmentsState
  };

  global.AppModules = global.AppModules || {};
  global.AppModules.config = configApi;

  // Preserve legacy globals for existing inline scripts until fully refactored.
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
