'use strict';
/**
 * MODULE: assets/js/ui-tabs.js
 * Description: Steuert Tabwechsel, Header-Schatten und Auth-Locks (Doctor-Unlock) über UI-Events und Zustandssperren.
 * Submodules:
 *  - authState (atomare Auth-Flags & Safe-Queue)
 *  - setTab (Tabwechsel-Logik inkl. Unlock & Refresh)
 *  - bindTabs (UI-Button-Handler)
 *  - bindHeaderShadow (Scroll-Elevation-Handler)
 * Notes:
 *  - AuthQueue verhindert Race Conditions bei parallelen Unlock-Events.
 *  - Hybrid-kompatibel über window.AppModules und globale Fallbacks.
 */

// SUBMODULE: init @internal - initialisiert AppModules.uiTabs und lokale Shortcuts
(function (global) {
  const appModules = (global.AppModules = global.AppModules || {});
  const $ = (sel) => global.document.querySelector(sel);
  const $$ = (sel) => Array.from(global.document.querySelectorAll(sel));
  const getSupabaseApi = () => global.AppModules?.supabase || {};

  // SUBMODULE: authState @internal - kapselt Doctor-Unlock-Status mit atomarem Promise-Lock
  const authState = (() => {
    let doctorUnlockedVal = Boolean(global.__doctorUnlocked);
    let pendingAfterUnlockVal = global.__pendingAfterUnlock || null;
    let lock = Promise.resolve();

    const state = {
      get doctorUnlocked() {
        return doctorUnlockedVal;
      },
      set doctorUnlocked(v) {
        doctorUnlockedVal = !!v;
        global.__doctorUnlocked = doctorUnlockedVal;
      },
      get pendingAfterUnlock() {
        return pendingAfterUnlockVal;
      },
      set pendingAfterUnlock(v) {
        pendingAfterUnlockVal = v ?? null;
        global.__pendingAfterUnlock = pendingAfterUnlockVal;
      },
      async updateSafely(fn) {
        lock = lock.then(async () => {
          try {
            return await fn(state);
          } catch (err) {
            console.error('[uiTabs:authState] updateSafely failed:', err);
            throw err; // ← Fehler wird jetzt propagiert
          }
        });
        return lock;
      }
    };
    return state;
  })();

  // SUBMODULE: setTab @public - steuert aktiven Tab inkl. Doctor-Auth, Unlock und UI-Refresh
  async function setTab(name) {
    if (!name || typeof name !== 'string') return;

    // Unlock bei gesperrter UI zurücksetzen
    if (name !== 'doctor' && global.document.body.classList.contains('app-locked')) {
      await authState.updateSafely(async (s) => {
        s.pendingAfterUnlock = null;
        getSupabaseApi().lockUi?.(false);
      });
    }

    if (name === 'doctor') {
      try {
        const supaApi = getSupabaseApi();
        const logged = await supaApi.isLoggedInFast?.();
        if (!logged) {
          supaApi.showLoginOverlay?.(true);
          return;
        }

        // Atomare Entscheidung im Queue-Kontext
        const needPrompt = await authState.updateSafely(async (s) => {
          if (s.doctorUnlocked) return false;       // schon offen → kein Prompt
          if (s.pendingAfterUnlock === 'doctor') return false; // bereits in Bearbeitung
          s.pendingAfterUnlock = 'doctor';          // Flag setzen
          return true;                              // Prompt nötig
        });

        if (needPrompt) {
          const ok = await supaApi.requireDoctorUnlock?.();
          if (!ok) return;
          // Nach erfolgreichem Unlock Status updaten
          await authState.updateSafely(async (s) => {
            s.pendingAfterUnlock = null;
            s.doctorUnlocked = true;
          });
        }

      } catch (err) {
        console.warn('[uiTabs:setTab] Doctor auth failed:', err);
        return;
      }
    }

    // View-Wechsel
    $$('.view').forEach((v) => v.classList.remove('active'));
    const viewEl = $('#' + name);
    if (viewEl) viewEl.classList.add('active');
    else console.warn(`[uiTabs:setTab] View element #${name} not found.`);

    // Tabs aktualisieren
    $$('.tabs .btn').forEach((b) => {
      const active = b.dataset.tab === name;
      b.classList.toggle('primary', active);
      if (active) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });

    // Optional Refresh je nach Tab
    if (name === 'doctor') {
      await global.requestUiRefresh?.({ reason: 'tab:doctor' });
    } else if (name === 'capture') {
      try {
        await global.refreshCaptureIntake?.();
        global.resetCapturePanels?.();
        global.AppModules?.bp?.updateBpCommentWarnings?.();
      } catch (err) {
        console.warn('[uiTabs:setTab] Capture refresh failed:', err);
      }
    }
  }

// SUBMODULE: bindTabs @public - verbindet Tabbuttons mit setTab(), behandelt Click-Events sicher
  function bindTabs() {
    const btns = $$('.tabs .btn');
    if (!btns.length) return;

    btns.forEach((b) =>
      b.addEventListener('click', async (e) => {
        const tab = e.currentTarget?.dataset?.tab;
        if (!tab) return;
        try {
          await setTab(tab);
        } catch (err) {
          console.error('[uiTabs:bindTabs] Tab click error:', err);
        }
      })
    );
  }

  // SUBMODULE: bindHeaderShadow @public - fügt Header/Tabs Schatten bei Scroll hinzu
  function bindHeaderShadow() {
    const header = global.document.querySelector('header');
    const tabs = global.document.querySelector('nav.tabs');
    if (!header) return;

    const update = () => {
      const scrolled = global.scrollY > 4;
      header.classList.toggle('is-elevated', scrolled);
      if (tabs) tabs.classList.toggle('is-elevated', scrolled);
    };

    update();
    global.addEventListener('scroll', update, { passive: true });
  }

  // SUBMODULE: export @internal - registriert API unter AppModules und als globale Fallbacks
  const uiTabsApi = { setTab, bindTabs, bindHeaderShadow };
  appModules['uiTabs'] = uiTabsApi;

  ['setTab', 'bindTabs', 'bindHeaderShadow'].forEach((k) => {
    if (!Object.prototype.hasOwnProperty.call(global, k)) {
      Object.defineProperty(global, k, {
        value: uiTabsApi[k],
        writable: false,
        configurable: true,
        enumerable: false
      });
    }
  });
})(window);

