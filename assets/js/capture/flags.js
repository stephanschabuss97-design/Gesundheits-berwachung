'use strict';
(function(global) {
  global.AppModules = global.AppModules || {};

  const FLAG_KEYS = ['trainingActive','lowIntakeActive','sickActive','valsartanMissed','forxigaMissed','nsarTaken','saltHigh','proteinHigh'];
  const LEGACY_FLAG_PROPS = {
    trainingActive: 'trainingActive',
    lowIntakeActive: 'lowIntakeActive',
    sickActive: 'sickActive',
    valsartanMissed: 'valsartanMissed',
    forxigaMissed: 'forxigaMissed',
    nsarTaken: 'nsarTaken',
    saltHigh: 'saltHigh',
    proteinHigh: 'proteinHigh'
  };

  function readLegacyFlag(key) {
    const prop = LEGACY_FLAG_PROPS[key];
    return prop ? !!global[prop] : false;
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

