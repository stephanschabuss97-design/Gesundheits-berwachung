'use strict';
/**
 * MODULE: hub/index.js
 * Description: Aktiviert das neue MIDAS Hub Layout, sobald `CAPTURE_HUB_V2` gesetzt ist.
 * Notes:
 *  - UI-only: Buttons/Chat reagieren lokal, steuern noch keine Module.
 */

(function (global) {
  global.AppModules = global.AppModules || {};
  const appModules = global.AppModules;
  const doc = global.document;

  const ORBIT_BUTTONS = {
    north: { angle: -90 },
    ne: { angle: -45, radiusScale: 0.88 },
    e: { angle: 0 },
    se: { angle: 45, radiusScale: 0.88 },
    s: { angle: 90 },
    sw: { angle: 135, radiusScale: 0.88 },
    w: { angle: 180 },
    nw: { angle: -135, radiusScale: 0.88 },
  };

  let hubButtons = [];
  let activePanel = null;
  let setSpriteStateFn = null;
  let doctorUnlockWaitCancel = null;

  const getSupabaseApi = () =>
    appModules.supabase || global.SupabaseAPI || appModules.supabase;

  const syncButtonState = (target) => {
    hubButtons.forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn === target));
    });
  };

  const handlePanelEsc = (event) => {
    if (event.key === 'Escape') {
      closeActivePanel();
    }
  };

  const closeActivePanel = ({ skipButtonSync = false } = {}) => {
    if (!activePanel) return;
    const panel = activePanel;

    const finish = () => {
      panel.removeEventListener('animationend', handleAnimationEnd);
      if (panel._hubCloseTimer) {
        global.clearTimeout(panel._hubCloseTimer);
        panel._hubCloseTimer = null;
      }
      panel.classList.remove('hub-panel-closing', 'hub-panel-open', 'is-visible');
      panel.hidden = true;
      panel.setAttribute('aria-hidden', 'true');
      activePanel = null;
      doc.removeEventListener('keydown', handlePanelEsc);
      setSpriteStateFn?.('idle');
      if (!skipButtonSync) {
        syncButtonState(null);
      }
    };

    const handleAnimationEnd = (event) => {
      if (event?.target !== panel) return;
      finish();
    };

    panel.classList.remove('hub-panel-open');
    panel.classList.add('hub-panel-closing');
    panel.setAttribute('aria-hidden', 'true');
    panel.hidden = false;
    panel.addEventListener('animationend', handleAnimationEnd);
    panel._hubCloseTimer = global.setTimeout(finish, 1200);
  };

  const setupOrbitHotspots = (hub) => {
    const orbit = hub.querySelector('.hub-orbit');
    const buttons = orbit?.querySelectorAll('[data-orbit-pos]');
    if (!orbit || !buttons.length) return;

    const getBaseFactor = () =>
      global.matchMedia('(max-width: 640px)').matches ? 0.76 : 0.72;

    const setPositions = () => {
      const rect = orbit.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const baseRadius = (Math.min(rect.width, rect.height) / 2) * getBaseFactor();

      buttons.forEach((btn) => {
        const key = btn.dataset.orbitPos;
        const config = ORBIT_BUTTONS[key];
        if (!config) return;
        const angle = ((config.angle ?? 0) * Math.PI) / 180;
        const radius = baseRadius * (config.radiusScale ?? 1);
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        btn.style.left = `${x}px`;
        btn.style.top = `${y}px`;
      });
    };

    const debouncedUpdate = () => global.requestAnimationFrame(setPositions);
    const resizeObserver = new ResizeObserver(debouncedUpdate);
    resizeObserver.observe(orbit);
    global.addEventListener('resize', debouncedUpdate);
    setPositions();
  };

  const openPanel = (panelName) => {
    if (!doc) return null;
    const panel = doc.querySelector(`[data-hub-panel="${panelName}"]`);
    if (!panel) return null;
    if (activePanel === panel) return panel;
    if (activePanel) {
      closeActivePanel({ skipButtonSync: true });
    }
    panel.classList.remove('hub-panel-closing');
    if (panel._hubCloseTimer) {
      global.clearTimeout(panel._hubCloseTimer);
      panel._hubCloseTimer = null;
    }
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    panel.classList.add('is-visible');
    // force reflow before animation to ensure restart
    void panel.offsetWidth; // eslint-disable-line no-unused-expressions
    panel.classList.add('hub-panel-open');
    activePanel = panel;
    doc.addEventListener('keydown', handlePanelEsc);
    if (typeof panel.scrollIntoView === 'function') {
      requestAnimationFrame(() => {
        panel.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    }
    return panel;
  };

  const setupPanels = () => {
    const panels = doc?.querySelectorAll('[data-hub-panel]');
    if (!panels) return;
    panels.forEach((panel) => {
      panel.hidden = true;
      panel.setAttribute('aria-hidden', 'true');
      panel.querySelectorAll('[data-panel-close]').forEach((btn) => {
        btn.addEventListener('click', () => closeActivePanel());
      });
    });
  };

  const ensureDoctorUnlocked = async () => {
    const supa = getSupabaseApi();
    const unlockFn = supa?.requireDoctorUnlock || global.requireDoctorUnlock;
    if (typeof unlockFn !== 'function') return true;
    try {
      const ok = await unlockFn();
      return !!ok;
    } catch (err) {
      console.warn('[hub] doctor unlock failed', err);
      return false;
    }
  };

  const waitForDoctorUnlock = ({ guardState, timeout = 60000 } = {}) =>
    new Promise((resolve) => {
      const state = guardState || getSupabaseApi()?.authGuardState;
      if (!state) {
        resolve(false);
        return;
      }
      if (state.doctorUnlocked) {
        resolve(true);
        return;
      }
      const interval = 200;
      let elapsed = 0;
      doctorUnlockWaitCancel?.(false);
      let finished = false;
      const cleanup = (result) => {
        if (finished) return;
        finished = true;
        global.clearInterval(timerId);
        if (doctorUnlockWaitCancel === cleanup) {
          doctorUnlockWaitCancel = null;
        }
        resolve(result);
      };
      const timerId = global.setInterval(() => {
        if (state.doctorUnlocked) {
          cleanup(true);
          return;
        }
        elapsed += interval;
        if (elapsed >= timeout) {
          cleanup(false);
        }
      }, interval);
      doctorUnlockWaitCancel = cleanup;
    });

  const activateHubLayout = () => {
    const config = appModules.config || {};
    if (!doc) {
      global.console?.debug?.('[hub] document object missing');
      return;
    }
    const hub = doc.getElementById('captureHub');
    if (!hub) {
      global.console?.debug?.('[hub] #captureHub element not found', { config });
      return;
    }
    setupIconBar(hub);
    setupOrbitHotspots(hub);
    setupPanels();
    setupDatePill(hub);
    moveIntakePillsToHub();
    setupChat(hub);
    setupSpriteState(hub);
    doc.body.classList.add('hub-mode');
  };

  const setupIconBar = (hub) => {
    hubButtons = Array.from(hub.querySelectorAll('.hub-icon:not([disabled])'));

    const bindButton = (selector, handler, { sync = true } = {}) => {
      const btn = hub.querySelector(selector);
      if (!btn) return;
      const invoke = async () => {
        if (sync) syncButtonState(btn);
        try {
          await handler(btn);
        } catch (err) {
          console.error('[hub] button handler failed', err);
          if (sync) syncButtonState(null);
        }
      };
      btn.addEventListener('click', () => {
        invoke();
      });
    };

    const openPanelHandler = (panelName) => async (btn) => {
      if (activePanel?.dataset?.hubPanel === panelName) {
        closeActivePanel();
        return;
      }
      const panel = openPanel(panelName);
      if (!panel) {
        syncButtonState(null);
        setSpriteStateFn?.('idle');
        return;
      }
      syncButtonState(btn);
      setSpriteStateFn?.(panelName);
    };

    bindButton('[data-hub-module="intake"]', openPanelHandler('intake'), { sync: false });
    bindButton('[data-hub-module="vitals"]', openPanelHandler('vitals'), { sync: false });
    const doctorPanelHandler = openPanelHandler('doctor');
    bindButton('[data-hub-module="doctor"]', async (btn) => {
      if (await ensureDoctorUnlocked()) {
        await doctorPanelHandler(btn);
        return;
      }
      const supa = getSupabaseApi();
      const guardState = supa?.authGuardState;
      const unlockedAfter = await waitForDoctorUnlock({ guardState });
      if (unlockedAfter) {
        await doctorPanelHandler(btn);
      }
    }, { sync: false });
    bindButton('#helpToggle', () => {}, { sync: false });
    bindButton('#diagToggle', () => {}, { sync: false });
  };
  const setupChat = (hub) => {
    const form = hub.querySelector('#hubChatForm');
    if (!form) return;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = form.querySelector('#hubMessage');
      const value = input?.value?.trim();
      if (value) {
        console.info('[hub-chat]', value, '(stub: Assistant folgt)');
        input.value = '';
      }
    });
  };

  const setupSpriteState = (hub) => {
    const orb = hub.querySelector('.hub-orb');
    const fg = hub.querySelector('.hub-orb-fg');
    if (!orb) return;
    const defaultImg = 'assets/img/Idle_state.png';
    const persistIdle = () => {
      if (fg) {
        fg.src = defaultImg;
        fg.alt = 'MIDAS Orb idle';
      }
      orb.dataset.state = 'idle';
      global.console?.debug?.('[hub] sprite state locked -> idle');
    };
    persistIdle();
    setSpriteStateFn = persistIdle;
    appModules.hub = Object.assign(appModules.hub || {}, { setSpriteState: persistIdle });
  };

  const setupDatePill = () => {
    const captureDate = doc?.getElementById('date');
    if (!captureDate) return;
    if (!captureDate.value) {
      captureDate.value = new Date().toISOString().slice(0, 10);
      captureDate.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  const moveIntakePillsToHub = () => {
    const hub = doc?.querySelector('[data-role="hub-intake-pills"]');
    const pills = doc?.getElementById('cap-intake-status-top');
    if (!hub) return;
    if (!pills) {
      setTimeout(moveIntakePillsToHub, 500);
      return;
    }
    hub.innerHTML = '';
    pills.classList.add('hub-intake-pills');
    hub.appendChild(pills);
  };

  if (doc?.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', activateHubLayout, { once: true });
  } else {
    activateHubLayout();
  }

  appModules.hub = Object.assign(appModules.hub || {}, { activateHubLayout });
})(typeof window !== 'undefined' ? window : globalThis);
