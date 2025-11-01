/**
 * MODULE: UI LAYOUT HELPERS
 * intent: haelt Sticky-Offsets aktuell und sorgt fuer unobstructed Inputs
 * exports: updateStickyOffsets, ensureNotObscured
 * notes: Logik unveraendert aus index.html extrahiert
 */

// SUBMODULE: updateStickyOffsets @internal - aktualisiert CSS-Offests fuer Header/Tabs
function updateStickyOffsets() {
  try {
    const headerEl = document.querySelector('header');
    const tabsEl = document.querySelector('nav.tabs');
    const headerH = Math.max(headerEl?.offsetHeight || 0, 48);
    const tabsH = Math.max(tabsEl?.offsetHeight || 0, 40);
    document.documentElement.style.setProperty('--header-h', `${headerH}px`);
    document.documentElement.style.setProperty('--tabs-h', `${tabsH}px`);
    const mainEl = document.getElementById('appMain');
    if (mainEl) {
      mainEl.style.paddingTop = `calc(${headerH}px + ${tabsH}px + 8px)`;
    }
  } catch (_) {
    /* noop */
  }
}

window.addEventListener('resize', updateStickyOffsets);
window.addEventListener('orientationchange', updateStickyOffsets);

// SUBMODULE: ensureNotObscured @internal - scrollt Fokusfelder unter Header hervor
function ensureNotObscured(el) {
  try {
    if (!el) return;
    const headerBottom =
      document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
    const tabsHeight =
      document.querySelector('nav.tabs')?.getBoundingClientRect().height ?? 0;
    const requiredTop = headerBottom + tabsHeight + 8;
    const rect = el.getBoundingClientRect();
    if (rect.top < requiredTop) {
      window.scrollBy({
        top: rect.top - requiredTop,
        left: 0,
        behavior: 'auto'
      });
    }
  } catch (_) {
    /* noop */
  }
}

document.addEventListener(
  'focusin',
  e => {
    try {
      if (!e.target?.matches?.('input, select, textarea, button')) return;
      ensureNotObscured(e.target);
    } catch (_) {
      /* noop */
    }
  },
  true
);

const uiLayoutApi = { updateStickyOffsets, ensureNotObscured };
window.AppModules = window.AppModules || {};
window.AppModules.uiLayout = uiLayoutApi;
Object.assign(window, uiLayoutApi);
