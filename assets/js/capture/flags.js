'use strict';
/**
 * MODULE: app/capture/flags/index.js
 * Description: Liefert einen sicheren Snapshot des aktuellen Capture-Flag-Zustands (Training, Medikation, Ernährung) aus globalen oder AppModules-Werten.
 * Submodules:
 *  - constants @internal - zentrale Flag-Schlüsseldefinition
 *  - readLegacyFlag @internal - liest alte globale Flags (Backward-Compatibility)
 *  - getCaptureFlagsStateSnapshot @public - kombiniert Capture-Modulzustand mit Legacy-Fallbacks
 *  - registration @internal - exponiert Snapshot-Funktion im globalen Namespace
 */

// SUBMODULE: globals & setup @internal - initialisiert global.AppModules-Container
(function(global) {
  global.AppModules = global.AppModules || {};

    // SUBMODULE: constants @internal - definiert bekannte Flag-Schlüssel
  const FLAG_KEYS = ['trainingActive','lowIntakeActive','sickActive','valsartanMissed','forxigaMissed','nsarTaken','saltHigh','proteinHigh'];

   // SUBMODULE: readLegacyFlag @internal - liest alte globale Variablen zur Rückwärtskompatibilität
  function readLegacyFlag(key) {
    return FLAG_KEYS.includes(key) ? !!global[key] : false;
  }

    // SUBMODULE: getCaptureFlagsStateSnapshot @public - ermittelt aktuellen Flag-State (Capture-Modul oder Legacy-Fallback)
  function getCaptureFlagsStateSnapshot() {
    try {
      const capture = global.AppModules?.capture;
      if (capture && typeof capture.getCaptureFlagsState === 'function') {
        return capture.getCaptureFlagsState() || {};
      }
    } catch (err) {
      try {
        console.warn('[capture flags] getCaptureFlagsState failed', err);
      } catch (_) { /* noop */ }
    }

        // SUBMODULE: legacy fallback @internal - baut Snapshot aus globalen Flags auf
    return FLAG_KEYS.reduce((acc, key) => {
      acc[key] = readLegacyFlag(key);
      return acc;
    }, {});
  }

    // SUBMODULE: registration @internal - exponiert Snapshot-Funktion im globalen Namespace
  global.getCaptureFlagsStateSnapshot = getCaptureFlagsStateSnapshot;
})(typeof window !== 'undefined' ? window : globalThis);

