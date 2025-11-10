'use strict';
/**
 * MODULE: assets/js/ui-errors.js
 * Description: Behandelt REST-Fehler, zeigt UI-Warnungen und verwaltet Busy-State von Buttons.
 * Submodules:
 *  - restErrorMessage (HTTP → Nutzertext Mapping)
 *  - uiRestError (UI-Fehleranzeige mit Fallback)
 *  - withBusy (Button-Zustandsschalter)
 * Notes:
 *  - Hybrid-Kompatibilität (AppModules + globale Fallbacks)
 *  - Minimalistisch gehalten; keine visuelle Abhängigkeit außer uiError()
 */

// SUBMODULE: init @internal - sichert global.AppModules.uiErrors ab
(function (global) {
  const appModules = (global.AppModules = global.AppModules || {});

  // SUBMODULE: restErrorMessage @public - mappt HTTP-Status auf Nutzertexte
  function restErrorMessage(status, details = '') {
    if (status === 0) return 'Netzwerkfehler – bitte Verbindung prüfen.';
    if (status === 401 || status === 403) return 'Bitte erneut anmelden.';
    if (status === 404) return 'Eintrag nicht gefunden.';
    if (status === 409) return 'Konflikt: Ein Eintrag existiert bereits.';
    if (status === 400 || status === 422) return 'Eingaben bitte prüfen.';
    if (status === 429) return 'Zu viele Anfragen – bitte kurz warten.';
    if (status >= 500) return 'Serverfehler – bitte später erneut versuchen.';
    return String(details || '').trim() || `Fehler (${status})`;
  }

  // SUBMODULE: uiRestError @public - zeigt REST-Fehler via uiError an
  function uiRestError(status, details, fallback) {
    try {
      const message = fallback || restErrorMessage(status, details);
      if (typeof global.uiError === 'function') {
        global.uiError(message);
      } else {
        console.error('[uiErrors:uiRestError] uiError() missing:', message);
        global.alert?.(message); // minimal fallback
      }
      return message;
    } catch (err) {
      console.error('[uiErrors:uiRestError] failed:', err);
      return null;
    }
  }

  // SUBMODULE: withBusy @public - toggelt Disabled-State für Buttons
  function withBusy(el, on = true) {
    if (!el) return;
    el.disabled = !!on;
  }

// SUBMODULE: exports @internal - registriert uiErrors-API unter AppModules und globalen Fallbacks
  const uiErrorApi = { restErrorMessage, uiRestError, withBusy };
  appModules.uiErrors = uiErrorApi;

// SUBMODULE: legacy globals @internal - definiert globale read-only Fallbacks falls nicht vorhanden
  const hasOwn = Object.hasOwn
    ? Object.hasOwn
    : (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);

  ['restErrorMessage', 'uiRestError', 'withBusy'].forEach((k) => {
    if (!hasOwn(global, k)) {
      Object.defineProperty(global, k, {
        value: uiErrorApi[k],
        writable: false,
        configurable: true,
        enumerable: false
      });
    }
  });
})(window);
