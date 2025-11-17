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

  const activateHubLayout = () => {
    const config = appModules.config || {};
    const doc = global.document;
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
    setupChat(hub);
    setupSpriteState(hub);
  };

  const setupIconBar = (hub) => {
    const buttons = hub.querySelectorAll('.hub-icon:not([disabled])');
    const syncPressed = (target) => {
      buttons.forEach((btn) => {
        btn.setAttribute('aria-pressed', String(btn === target));
      });
    };
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => syncPressed(btn));
    });
    const dateBtn = hub.querySelector('.hub-date-btn');
    const dateInput = hub.querySelector('#hubDatePicker');
    const captureDate = document.getElementById('date');
    if (dateBtn && dateInput && captureDate) {
      dateInput.value = captureDate.value || '';
      dateBtn.addEventListener('click', () => dateInput.showPicker?.());
      dateInput.addEventListener('input', () => {
        if (captureDate.value !== dateInput.value) {
          captureDate.value = dateInput.value;
          captureDate.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }
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

  const doc = global.document;
  if (doc?.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', activateHubLayout, { once: true });
  } else {
    activateHubLayout();
  }

  appModules.hub = Object.assign(appModules.hub || {}, { activateHubLayout });
})(typeof window !== 'undefined' ? window : globalThis);
