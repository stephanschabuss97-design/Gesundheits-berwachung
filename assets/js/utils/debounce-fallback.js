'use strict';
/**
 * MODULE: assets/js/debounce-wrapper.js
 * Description: Stellt eine universelle Debounce-Implementierung bereit, die vorhandene globale oder modulare Varianten nutzt.
 * Submodules:
 *  - createFallbackDebounce (eigene Implementierung mit cancel/flush)
 *  - resolvedDebounceImpl (entscheidet zwischen global/uiCore/fallback)
 *  - debounceWrapper (vereinheitlichte Exportfunktion)
 * Notes:
 *  - Bevorzugt global.debounce oder AppModules.uiCore.debounce.
 *  - Fallback bietet cancel() und flush() für präzise Steuerung.
 */

// SUBMODULE: init @internal - umschließt Modul im globalen IIFE
(function (global) {
  /**
   * Creates a standalone debounce implementation that also exposes cancel()/flush().
   * @returns {(fn: Function, ms?: number) => Function}
   */

  // SUBMODULE: createFallbackDebounce @internal - eigene Debounce-Implementierung mit cancel() und flush()
  const createFallbackDebounce = () => (fn, ms = 150) => {
    let timer = null;
    let lastArgs;
    const debounced = (...args) => {
      lastArgs = args;
      if (timer) global.clearTimeout(timer);
      timer = global.setTimeout(() => {
        timer = null;
        fn(...lastArgs);
      }, ms);
    };
    debounced.cancel = () => {
      if (timer) {
        global.clearTimeout(timer);
        timer = null;
      }
    };
    debounced.flush = () => {
      if (!timer) return;
      global.clearTimeout(timer);
      timer = null;
      fn(...lastArgs);
    };
    return debounced;
  };

    // SUBMODULE: resolvedDebounceImpl @internal - wählt globale oder modulare Implementierung
  const resolvedDebounceImpl =
    typeof global.debounce === 'function'
      ? global.debounce
      : global.AppModules?.uiCore?.debounce || createFallbackDebounce();

      //=== DEBOUNCE WRAPPER EXPORT ===
  /**
   * Universal debounce wrapper – prefers window.debounce, then AppModules.uiCore.debounce, else fallback.
   * @param {Function} fn
   * @param {number} [ms=150]
   * @returns {Function} debounced function (with cancel/flush if fallback)
   */

    // SUBMODULE: debounceWrapper @public - vereinheitlichte API für Debounce-Zugriff
  function debounceWrapper(fn, ms) {
    return resolvedDebounceImpl(fn, ms);
  }

  global.AppModules = global.AppModules || {};
  global.AppModules.debounce = debounceWrapper;

  if (typeof global.debounce !== 'function') {
    global.debounce = debounceWrapper;
  }
})(typeof window !== 'undefined' ? window : globalThis);
