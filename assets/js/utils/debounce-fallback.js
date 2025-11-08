(function (global) {
  const createFallbackDebounce = () => (fn, ms = 150) => {
    let timer = null;
    return (...args) => {
      if (timer) global.clearTimeout(timer);
      timer = global.setTimeout(() => {
        timer = null;
        fn(...args);
      }, ms);
    };
  };

  const resolveDebounceImpl = () =>
    (typeof global.debounce === 'function' && global.debounce !== debounceWrapper)
      ? global.debounce
      : global.AppModules?.uiCore?.debounce || createFallbackDebounce();

  function debounceWrapper(fn, ms) {
    const impl = resolveDebounceImpl();
    return impl(fn, ms);
  }

  global.AppModules = global.AppModules || {};
  global.AppModules.debounce = debounceWrapper;

  if (typeof global.debounce !== 'function') {
    global.debounce = debounceWrapper;
  }
})(typeof window !== 'undefined' ? window : globalThis);
