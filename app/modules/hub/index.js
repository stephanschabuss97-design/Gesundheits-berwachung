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

  let hubButtons = [];
  let activePanel = null;

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
    activePanel.hidden = true;
    activePanel.setAttribute('aria-hidden', 'true');
    activePanel.classList.remove('hub-panel-open');
    activePanel = null;
    doc.removeEventListener('keydown', handlePanelEsc);
    if (!skipButtonSync) {
      syncButtonState(null);
    }
  };

  const openPanel = (panelName) => {
    if (!doc) return null;
    const panel = doc.querySelector(`[data-hub-panel="${panelName}"]`);
    if (!panel) return null;
    if (activePanel === panel) return panel;
    if (activePanel) {
      closeActivePanel({ skipButtonSync: true });
    }
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    panel.classList.add('hub-panel-open');
    activePanel = panel;
    doc.addEventListener('keydown', handlePanelEsc);
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
    const supa = appModules.supabase || global.SupabaseAPI || appModules.supabase;
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
      btn.addEventListener(
        'pointerdown',
        (event) => {
          if (event.pointerType === 'touch') {
            event.preventDefault();
            invoke();
          }
        },
        { passive: false }
      );
    };

    const openPanelHandler = (panelName) => async (btn) => {
      if (activePanel?.dataset?.hubPanel === panelName) {
        closeActivePanel();
        return;
      }
      const panel = openPanel(panelName);
      if (!panel) {
        syncButtonState(null);
        return;
      }
      syncButtonState(btn);
    };

    bindButton('[data-hub-module="intake"]', openPanelHandler('intake'), { sync: false });
    bindButton('[data-hub-module="vitals"]', openPanelHandler('vitals'), { sync: false });
    bindButton('[data-hub-module="doctor"]', async (btn) => {
      if (!(await ensureDoctorUnlocked())) {
        return;
      }
      await openPanelHandler('doctor')(btn);
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
    if (!orb) return;
    const allowed = new Set(['idle', 'thinking', 'voice']);
    const setState = (state) => {
      const next = allowed.has(state) ? state : 'idle';
      orb.dataset.state = next;
      global.console?.debug?.('[hub] sprite state ->', next);
    };
    setState(orb.dataset.state || 'idle');
    appModules.hub = Object.assign(appModules.hub || {}, { setSpriteState: setState });
  };

  const setupDatePill = (hub) => {
    const pill = hub.querySelector('#hubDatePill');
    const text = hub.querySelector('#hubDateText');
    const captureDate = document.getElementById('date');
    if (!pill || !text || !captureDate) return;
    const update = () => {
      const dateValue = captureDate.value || new Date().toISOString().slice(0, 10);
      const formatted = new Date(dateValue).toLocaleDateString();
      text.textContent = formatted;
    };
    if (!captureDate.value) {
      captureDate.value = new Date().toISOString().slice(0, 10);
      captureDate.dispatchEvent(new Event('change', { bubbles: true }));
    }
    update();
    captureDate.addEventListener('change', update);
    pill.addEventListener('click', () => captureDate.showPicker?.());
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





