(function (global) {
  /**
   * Creates a standalone debounce implementation that also exposes cancel()/flush().
   * @returns {(fn: Function, ms?: number) => Function}
   */
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

  const resolvedDebounceImpl =
    typeof global.debounce === 'function'
      ? global.debounce
      : global.AppModules?.uiCore?.debounce || createFallbackDebounce();

  /**
   * Universal debounce wrapper – prefers window.debounce, then AppModules.uiCore.debounce, else fallback.
   * @param {Function} fn
   * @param {number} [ms=150]
   * @returns {Function} debounced function (with cancel/flush if fallback)
   */
  function debounceWrapper(fn, ms) {
    return resolvedDebounceImpl(fn, ms);
  }

  global.AppModules = global.AppModules || {};
  global.AppModules.debounce = debounceWrapper;

  if (typeof global.debounce !== 'function') {
    global.debounce = debounceWrapper;
  }
})(typeof window !== 'undefined' ? window : globalThis);
