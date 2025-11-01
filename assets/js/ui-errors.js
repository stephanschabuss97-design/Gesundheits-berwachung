/**
 * MODULE: UI ERROR HELPERS
 * intent: zentrale REST-Fehlerformate und Busy-Helpers
 * exports: restErrorMessage, uiRestError, withBusy
 * notes: Logik unveraendert aus index.html extrahiert
 */

// SUBMODULE: restErrorMessage @internal - mappt HTTP Status auf Nutzertexte
function restErrorMessage(status, details = '') {
  const norm = String(details || '').trim();
  if (status === 0) return 'Netzwerkfehler - bitte Verbindung pruefen.';
  if (status === 401 || status === 403) return 'Bitte erneut anmelden.';
  if (status === 404) return 'Eintrag nicht gefunden.';
  if (status === 409) return 'Konflikt: Ein Eintrag existiert bereits.';
  if (status === 400 || status === 422) return 'Eingaben bitte pruefen.';
  if (status === 429) return 'Zu viele Anfragen - bitte kurz warten.';
  if (status >= 500) return 'Serverfehler - bitte spaeter erneut versuchen.';
  return norm || `Fehler (${status})`;
}

// SUBMODULE: uiRestError @internal - zeigt REST Fehler via uiError an
function uiRestError(status, details, fallback) {
  uiError(fallback || restErrorMessage(status, details));
}

// SUBMODULE: withBusy @internal - toggelt Disabled-State fuer Buttons
function withBusy(el, on = true) {
  if (!el) return;
  el.disabled = !!on;
}

const uiErrorApi = { restErrorMessage, uiRestError, withBusy };
window.AppModules = window.AppModules || {};
window.AppModules.uiErrors = uiErrorApi;
Object.assign(window, uiErrorApi);
