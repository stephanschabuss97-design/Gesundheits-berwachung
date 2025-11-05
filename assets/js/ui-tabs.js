'use strict';
/**
 * MODULE: uiTabs
 * intent: Handhabt Tab-Umschaltung, Header-Schatten und Button-Bindings
 * exports: setTab, bindTabs, bindHeaderShadow
 * version: 1.3
 * compat: Hybrid (Monolith + window.AppModules)
 * notes: Kapselung des globalen Auth-States (__doctorUnlocked / __pendingAfterUnlock)
 */

(function (global) {
  const appModules = (global.AppModules = global.AppModules || {});

  // Hilfs-Shortcuts
  const $ = (sel) => global.document.querySelector(sel);
  const $$ = (sel) => Array.from(global.document.querySelectorAll(sel));

  // SUBMODULE: authState @internal - kapselt globale Auth-Flags sicher
  const authState = (() => {
    let lock = Promise.resolve(); // einfache Queue zur Serialisierung
    const state = {
      get doctorUnlocked() {
        return Boolean(global.__doctorUnlocked);
      },
      set doctorUnlocked(v) {
        global.__doctorUnlocked = !!v;
      },
      get pendingAfterUnlock() {
        return global.__pendingAfterUnlock || null;
      },
      set pendingAfterUnlock(v) {
        global.__pendingAfterUnlock = v ?? null;
      },
      async updateSafely(fn) {
        // garantiert sequentielle Updates
        lock = lock.then(async () => {
          await fn(state);
        });
        return lock;
      }
    };
    return state;
  })();

  // SUBMODULE: setTab @internal - steuert Tabwechsel inkl. Auth/Unlock Hooks
  async function setTab(name) {
    if (!name || typeof name !== 'string') return;

    if (name !== 'doctor' && global.document.body.classList.contains('app-locked')) {
      await authState.updateSafely(async (s) => {
        s.pendingAfterUnlock = null;
        global.lockUi?.(false);
      });
    }

    if (name === 'doctor') {
      try {
        const logged = await global.isLoggedInFast?.();
        if (!logged) {
          global.showLoginOverlay?.(true);
          return;
        }

        const unlocked = authState.doctorUnlocked;
        if (!unlocked) {
          await authState.updateSafely(async (s) => {
            s.pendingAfterUnlock = 'doctor';
          });
          const ok = await global.requireDoctorUnlock?.();
          if (!ok) return;
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

    $$('.view').forEach((v) => v.classList.remove('active'));

    const viewEl = $('#' + name);
    if (viewEl) viewEl.classList.add('active');
    else console.warn(`[uiTabs:setTab] View element #${name} not found.`);

    $$('.tabs .btn').forEach((b) => {
      const active = b.dataset.tab === name;
      b.classList.toggle('primary', active);
      if (active) {
        b.setAttribute('aria-current', 'page');
      } else {
        b.removeAttribute('aria-current');
      }
    });

    if (name === 'doctor') {
      await global.requestUiRefresh?.({ reason: 'tab:doctor' });
    } else if (name === 'capture') {
      try {
        await global.refreshCaptureIntake?.();
        global.resetCapturePanels?.();
        global.updateBpCommentWarnings?.();
      } catch (err) {
        console.warn('[uiTabs:setTab] Capture refresh failed:', err);
      }
    }
  }

  // SUBMODULE: bindTabs @internal - verbindet Tabbuttons mit setTab
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

  // SUBMODULE: bindHeaderShadow @internal - toggelt Schatten bei Scroll
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

  // Export
  const uiTabsApi = { setTab, bindTabs, bindHeaderShadow, authState };
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
