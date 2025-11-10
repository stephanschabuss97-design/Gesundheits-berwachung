'use strict';
/**
 * MODULE: assets/js/ui-layout.js
 * Description: Steuert Sticky-Offsets und Scroll-Korrekturen, damit Eingaben und Buttons nicht durch Header/Tabs verdeckt werden.
 * Submodules:
 *  - updateStickyOffsets (berechnet dynamische CSS-Offsets)
 *  - ensureNotObscured (scrollt fokussierte Elemente sichtbar)
 *  - bindAutoFocusScroll (Event-Handler für focusin)
 *  - bindResizeEvents (Reaktion auf Layoutänderungen)
 * Notes:
 *  - Initialisiert Offsets sofort beim Laden.
 *  - Hybrid-kompatibel (AppModules + globale Fallbacks).
 */

// SUBMODULE: init @internal - stellt global.AppModules.uiLayout bereit
(function (global) {
  const appModules = (global.AppModules = global.AppModules || {});

  // SUBMODULE: updateStickyOffsets @public - setzt CSS-Variablen für Header- und Tab-Höhen
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

 // SUBMODULE: ensureNotObscured @public - scrollt Eingabefelder sichtbar, falls sie durch Header/Tabs verdeckt sind
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

  // SUBMODULE: bindAutoFocusScroll @internal - reagiert auf Fokuswechsel und korrigiert automatisch den Sichtbereich
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

// SUBMODULE: bindResizeEvents @internal - aktualisiert Sticky-Offsets bei Resize und Orientationchange
  function bindResizeEvents() {
    global.addEventListener('resize', updateStickyOffsets);
    global.addEventListener('orientationchange', updateStickyOffsets);
  }

  // SUBMODULE: initialization @internal - aktiviert Event-Bindings und berechnet Startwerte
  bindResizeEvents();
  bindAutoFocusScroll();
  updateStickyOffsets();

  // SUBMODULE: exports @internal - registriert uiLayout-API in AppModules und global
  const uiLayoutApi = { updateStickyOffsets, ensureNotObscured };
  appModules.uiLayout = uiLayoutApi;

// SUBMODULE: legacy globals @internal - definiert globale read-only Fallbacks falls nicht vorhanden
  const hasOwn = Object.hasOwn
    ? Object.hasOwn
    : (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);

  ['updateStickyOffsets', 'ensureNotObscured'].forEach((k) => {
    if (!hasOwn(global, k)) {
      Object.defineProperty(global, k, {
        value: uiLayoutApi[k],
        writable: false,
        configurable: true,
        enumerable: false
      });
    }
  });
})(window);
