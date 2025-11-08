'use strict';
/**
 * MODULE: config
 * intent: Global Runtime Defaults (Dev toggles, appointment meta/state)
 * exports: DEV_ALLOW_DEFAULTS, APPOINTMENT_GRACE_MS, APPOINTMENT_ROLES, appointmentsState
 * compat: Browser legacy (window globals) + AppModules.config
 */

(function (global) {
  const DEV_ALLOW_DEFAULTS =
    /^(localhost|127\.0\.0\.1|.*\.local)$/i.test(global?.location?.hostname || '');
  const APPOINTMENT_GRACE_MS = 5 * 60 * 1000;
  const APPOINTMENT_ROLES = [
    { code: 'nephro', label: 'Nephrologe' },
    { code: 'internal', label: 'Internist' },
    { code: 'urology', label: 'Urologe' },
    { code: 'dentist', label: 'Zahnarzt' },
    { code: 'ophtha', label: 'Augenarzt' },
    { code: 'physio', label: 'Physiotherapie' }
  ];

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
