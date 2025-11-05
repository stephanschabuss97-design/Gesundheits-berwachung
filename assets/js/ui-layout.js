'use strict';
/**
 * MODULE: uiLayout
 * intent: Verwaltet Sticky-Offsets und stellt sicher, dass Eingabefelder nicht verdeckt werden
 * exports: updateStickyOffsets, ensureNotObscured
 * version: 1.1
 * compat: Hybrid (Monolith + window.AppModules)
 * notes: Verhalten unverändert, modernisiert & gekapselt
 */

(function (global) {
  const appModules = (global.AppModules = global.AppModules || {});

  // SUBMODULE: updateStickyOffsets @public - aktualisiert CSS-Offsets für Header/Tabs
  function updateStickyOffsets() {
    try {
      const d = global.document;
      const headerEl = d.querySelector('header');
      const tabsEl = d.querySelector('nav.tabs');

      const headerH = Math.max(headerEl?.offsetHeight || 0, 48);
      const tabsH = Math.max(tabsEl?.offsetHeight || 0, 40);

      const root = d.documentElement;
      root.style.setProperty('--header-h', `${headerH}px`);
      root.style.setProperty('--tabs-h', `${tabsH}px`);

      const mainEl = d.getElementById('appMain');
      if (mainEl) {
        mainEl.style.paddingTop = `calc(${headerH}px + ${tabsH}px + 8px)`;
      }
    } catch (err) {
      console.error('[uiLayout:updateStickyOffsets] failed:', err);
    }
  }

  // SUBMODULE: ensureNotObscured @public - scrollt Fokusfelder unter Header hervor
  function ensureNotObscured(el) {
    try {
      if (!el) return;

      const d = global.document;
      const header = d.querySelector('header');
      const tabs = d.querySelector('nav.tabs');

      const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
      const tabsHeight = tabs?.getBoundingClientRect().height ?? 0;
      const requiredTop = headerBottom + tabsHeight + 8;

      const rect = el.getBoundingClientRect();
      if (rect.top < requiredTop) {
        global.scrollBy({
          top: rect.top - requiredTop,
          left: 0,
          behavior: 'auto'
        });
      }
    } catch (err) {
      console.error('[uiLayout:ensureNotObscured] failed:', err);
    }
  }

  // SUBMODULE: bindAutoFocusScroll @internal - reagiert auf focusin-Events
  function bindAutoFocusScroll() {
    global.document.addEventListener(
      'focusin',
      (e) => {
        try {
          const target = e.target;
          if (!target?.matches?.('input, select, textarea, button')) return;
          ensureNotObscured(target);
        } catch (err) {
          console.error('[uiLayout:focusin] handler error:', err);
        }
      },
      true
    );
  }

  // SUBMODULE: bindResizeEvents @internal - aktualisiert Offsets bei Layout-Änderung
  function bindResizeEvents() {
    global.addEventListener('resize', updateStickyOffsets);
    global.addEventListener('orientationchange', updateStickyOffsets);
  }

  // Initialisierung
  bindResizeEvents();
  bindAutoFocusScroll();

  // Exportfläche
  const uiLayoutApi = { updateStickyOffsets, ensureNotObscured };
  appModules.uiLayout = uiLayoutApi;

  // Legacy read-only globals
  ['updateStickyOffsets', 'ensureNotObscured'].forEach((k) => {
    if (!Object.prototype.hasOwnProperty.call(global, k)) {
      Object.defineProperty(global, k, {
        value: uiLayoutApi[k],
        writable: false,
        configurable: true,
        enumerable: false
      });
    }
  });
})(window);
