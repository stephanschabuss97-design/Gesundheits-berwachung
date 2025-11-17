'use strict';
/**
 * MODULE: diagnostics/perf.js
 * Description: Per-Module Performance-Sampler (Readiness-Version) f�r das Diagnostics-Layer; ersetzt sp�ter die perfStats-Helpers aus app/core/diag.js.
 * Submodules:
 *  - bucket registry (key validation + sample buffer)
 *  - record helper (ruft performance.now und schreibt Snapshots)
 *  - diagnosticsLayer export (AppModules.diagnosticsLayer.perf)
 */

(function (global) {
  global.AppModules = global.AppModules || {};
  const appModules = global.AppModules;
  const config = appModules.config || {};
  const diagnosticsLayer = (appModules.diagnosticsLayer = appModules.diagnosticsLayer || {});
  const enabled = config.DIAGNOSTICS_ENABLED !== false;

  const MAX_SAMPLES = 50;
  const MAX_BUCKETS = 20;
  const MAX_KEY_LENGTH = 64;
  const store = new Map();

  const validateKey = (key) => {
    if (typeof key !== 'string' || !key.trim()) return 'invalid';
    if (key.length > MAX_KEY_LENGTH) return 'too-long';
    if (!/^[a-z0-9_-]+$/i.test(key)) return 'format';
    if (!store.has(key) && store.size >= MAX_BUCKETS) return 'limit';
    return null;
  };

  const recordSample = (key, ms) => {
    if (!store.has(key)) store.set(key, []);
    const bucket = store.get(key);
    bucket.push(ms);
    if (bucket.length > MAX_SAMPLES) bucket.shift();
  };

  const perfApi = {
    enabled,
    buckets: store,
    record(key, startedAt) {
      if (!enabled || startedAt == null) return;
      if (validateKey(key)) return;
      const hasPerf = typeof global.performance?.now === 'function';
      if (!hasPerf) return;
      const delta = global.performance.now() - startedAt;
      if (!Number.isFinite(delta) || delta < 0) return;
      recordSample(key, delta);
    },
    snapshot(key) {
      const bucket = store.get(key) || [];
      if (!bucket.length) return { count: 0 };
      const sorted = [...bucket].sort((a, b) => a - b);
      const pick = (p) => {
        const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1));
        return sorted[idx];
      };
      return {
        count: bucket.length,
        p50: pick(50),
        p90: pick(90),
        p99: pick(99)
      };
    }
  };

  diagnosticsLayer.perf = perfApi;
})(typeof window !== 'undefined' ? window : globalThis);
