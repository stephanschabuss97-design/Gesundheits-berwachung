'use strict';
(function(global) {
  global.AppModules = global.AppModules || {};

  function readLegacyFlag(key) {
    switch (key) {
      case 'trainingActive': return !!global.trainingActive;
      case 'lowIntakeActive': return !!global.lowIntakeActive;
      case 'sickActive': return !!global.sickActive;
      case 'valsartanMissed': return !!global.valsartanMissed;
      case 'forxigaMissed': return !!global.forxigaMissed;
      case 'nsarTaken': return !!global.nsarTaken;
      case 'saltHigh': return !!global.saltHigh;
      case 'proteinHigh': return !!global.proteinHigh;
      default: return false;
    }
  }

  function getCaptureFlagsStateSnapshot() {
    try {
      const capture = global.AppModules?.capture;
      if (capture && typeof capture.getCaptureFlagsState === 'function') {
        return capture.getCaptureFlagsState() || {};
      }
    } catch (_) {
      /* ignore */
    }
    return {
      trainingActive: readLegacyFlag('trainingActive'),
      lowIntakeActive: readLegacyFlag('lowIntakeActive'),
      sickActive: readLegacyFlag('sickActive'),
      valsartanMissed: readLegacyFlag('valsartanMissed'),
      forxigaMissed: readLegacyFlag('forxigaMissed'),
      nsarTaken: readLegacyFlag('nsarTaken'),
      saltHigh: readLegacyFlag('saltHigh'),
      proteinHigh: readLegacyFlag('proteinHigh')
    };
  }

  global.getCaptureFlagsStateSnapshot = getCaptureFlagsStateSnapshot;
})(typeof window !== 'undefined' ? window : globalThis);

