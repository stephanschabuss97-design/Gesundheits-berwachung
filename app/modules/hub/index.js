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
    setupDatePill(hub);
    moveIntakePillsToHub();
    setupChat(hub);
    setupSpriteState(hub);
    doc.body.classList.add('hub-mode');
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
    const intakeBtn = hub.querySelector('[data-hub-module="intake"]');
    if (intakeBtn) {
      const open = () => openIntakeOverlay(intakeBtn);
      intakeBtn.addEventListener('click', open);
      intakeBtn.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'touch') {
          event.preventDefault();
          open();
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

  const openIntakeOverlay = (trigger) => {
    const overlay = document.getElementById('hubIntakeOverlay');
    if (!overlay) return;
    const rect = trigger?.getBoundingClientRect();
    if (rect) {
      overlay.style.setProperty('--hub-modal-origin-x', `${rect.left + rect.width / 2}px`);
      overlay.style.setProperty('--hub-modal-origin-y', `${rect.top + rect.height / 2}px`);
    }
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('active');
    document.body.style.setProperty('overflow', 'hidden');
    const escHandler = (event) => {
      if (event.key === 'Escape') {
        closeIntakeOverlay();
      }
    };
    overlay._escHandler = escHandler;
    document.addEventListener('keydown', escHandler);

    overlay.querySelectorAll('[data-close-overlay]').forEach((el) => {
      el.addEventListener('click', closeIntakeOverlay);
    });

    overlay._open = true;
  };

  const closeIntakeOverlay = () => {
    const overlay = document.getElementById('hubIntakeOverlay');
    if (!overlay || !overlay._open) return;

    overlay.classList.add('closing');
    const finishClose = () => {
      overlay.classList.remove('closing');
      overlay.classList.remove('active');
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      overlay.removeEventListener('animationend', finishClose);
      overlay.querySelectorAll('[data-close-overlay]').forEach((el) => {
        el.removeEventListener('click', closeIntakeOverlay);
      });
      if (overlay._escHandler) {
        document.removeEventListener('keydown', overlay._escHandler);
        overlay._escHandler = null;
      }
      overlay._open = false;
      document.body.style.removeProperty('overflow');
    };
    overlay.addEventListener('animationend', finishClose);
  };

  const moveIntakePillsToHub = () => {
    const hub = document.querySelector('[data-role="hub-intake-pills"]');
    const pills = document.getElementById('cap-intake-status-top');
    if (!hub) return;
    if (!pills) {
      setTimeout(moveIntakePillsToHub, 500);
      return;
    }
    hub.innerHTML = '';
    pills.classList.add('hub-intake-pills');
    hub.appendChild(pills);
  };
