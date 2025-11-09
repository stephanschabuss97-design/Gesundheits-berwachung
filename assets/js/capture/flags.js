'use strict';
(function(global) {
  global.AppModules = global.AppModules || {};

  const FLAG_KEYS = ['trainingActive','lowIntakeActive','sickActive','valsartanMissed','forxigaMissed','nsarTaken','saltHigh','proteinHigh'];

  function readLegacyFlag(key) {
    return FLAG_KEYS.includes(key) ? !!global[key] : false;
  }

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
    return FLAG_KEYS.reduce((acc, key) => {
      acc[key] = readLegacyFlag(key);
      return acc;
    }, {});
  }

  global.getCaptureFlagsStateSnapshot = getCaptureFlagsStateSnapshot;
})(typeof window !== 'undefined' ? window : globalThis);

