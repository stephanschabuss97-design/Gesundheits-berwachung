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
    const bindButton = (selector, handler) => {
      const btn = hub.querySelector(selector);
      if (!btn) return;
      const open = () => handler(btn);
      btn.addEventListener('click', open);
      btn.addEventListener(
        'pointerdown',
        (event) => {
          if (event.pointerType === 'touch') {
            event.preventDefault();
            open();
          }
        },
        { passive: false }
      );
    };
    bindButton('[data-hub-module="intake"]', openIntakeOverlay);
    bindButton('[data-hub-module="vitals"]', openVitalsOverlay);
    bindButton('[data-hub-module="doctor"]', openDoctorOverlay);
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

  const openSimpleOverlay = (overlayId, trigger) => {
    if (!doc) return null;
    const overlay = doc.getElementById(overlayId);
    if (!overlay || overlay._open) return null;
    const rect = trigger?.getBoundingClientRect();
    if (rect) {
      overlay.style.setProperty('--hub-modal-origin-x', `${rect.left + rect.width / 2}px`);
      overlay.style.setProperty('--hub-modal-origin-y', `${rect.top + rect.height / 2}px`);
    }
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('active');
    doc.body?.style.setProperty('overflow', 'hidden');
    const escHandler = (event) => {
      if (event.key === 'Escape') {
        closeSimpleOverlay(overlayId);
      }
    };
    overlay._escHandler = escHandler;
    doc.addEventListener('keydown', escHandler);

    const clickHandler = () => closeSimpleOverlay(overlayId);
    overlay._closeHandler = clickHandler;
    overlay.querySelectorAll('[data-close-overlay]').forEach((el) => {
      el.addEventListener('click', clickHandler);
    });

    overlay._open = true;
    return overlay;
  };

  const closeSimpleOverlay = (overlayId) => {
    if (!doc) return;
    const overlay = doc.getElementById(overlayId);
    if (!overlay || !overlay._open) return;

    overlay.classList.add('closing');
    const finishClose = () => {
      overlay.removeEventListener('animationend', finishClose);
      overlay.removeEventListener('animationcancel', finishClose);
      if (overlay._closeTimer) {
        clearTimeout(overlay._closeTimer);
        overlay._closeTimer = null;
      }
      overlay.classList.remove('closing');
      overlay.classList.remove('active');
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      if (overlay._closeHandler) {
        overlay.querySelectorAll('[data-close-overlay]').forEach((el) => {
          el.removeEventListener('click', overlay._closeHandler);
        });
        overlay._closeHandler = null;
      }
      if (overlay._escHandler) {
        doc.removeEventListener('keydown', overlay._escHandler);
        overlay._escHandler = null;
      }
      overlay._open = false;
      doc.body?.style.removeProperty('overflow');
    };
    overlay.addEventListener('animationend', finishClose);
    overlay.addEventListener('animationcancel', finishClose);
    overlay._closeTimer = setTimeout(finishClose, 350);
  };

  const openIntakeOverlay = (trigger) => {
    openSimpleOverlay('hubIntakeOverlay', trigger);
  };

  const closeIntakeOverlay = () => {
    closeSimpleOverlay('hubIntakeOverlay');
  };

  const openVitalsOverlay = (trigger) => {
    openSimpleOverlay('hubVitalsOverlay', trigger);
  };

  const closeVitalsOverlay = () => {
    closeSimpleOverlay('hubVitalsOverlay');
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

  const openDoctorOverlay = async (trigger) => {
    const supa = appModules.supabase || global.SupabaseAPI;
    if (typeof supa?.requireDoctorUnlock === 'function') {
      const ok = await supa.requireDoctorUnlock();
      if (!ok) return;
    }
    const overlay = doc?.getElementById('hubDoctorOverlay');
    const doctor = doc?.getElementById('doctor');
    const content = overlay?.querySelector('#hubDoctorContent');
    if (!overlay || !doctor || !content || overlay._open) return;

    const rect = trigger?.getBoundingClientRect();
    if (rect) {
      overlay.style.setProperty('--hub-modal-origin-x', `${rect.left + rect.width / 2}px`);
      overlay.style.setProperty('--hub-modal-origin-y', `${rect.top + rect.height / 2}px`);
    }
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('active');
    document.body.style.setProperty('overflow', 'hidden');
    content.appendChild(doctor);
    overlay._open = true;

    const escHandler = (event) => {
      if (event.key === 'Escape') {
        closeDoctorOverlay();
      }
    };
    overlay._escHandler = escHandler;
    document.addEventListener('keydown', escHandler);
    overlay.querySelectorAll('[data-close-overlay]').forEach((el) =>
      el.addEventListener('click', closeDoctorOverlay)
    );
  };

  const closeDoctorOverlay = () => {
    const overlay = doc?.getElementById('hubDoctorOverlay');
    const doctor = doc?.getElementById('doctor');
    if (!overlay || !overlay._open || !doctor) return;
    overlay.classList.add('closing');
    const finishClose = () => {
      overlay.classList.remove('closing');
      overlay.classList.remove('active');
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      overlay.removeEventListener('animationend', finishClose);
      overlay.querySelectorAll('[data-close-overlay]').forEach((el) =>
        el.removeEventListener('click', closeDoctorOverlay)
      );
      if (overlay._escHandler) {
        document.removeEventListener('keydown', overlay._escHandler);
        overlay._escHandler = null;
      }
      overlay.querySelector('#hubDoctorContent')?.appendChild(doctor);
      overlay._open = false;
      document.body.style.removeProperty('overflow');
    };
    overlay.addEventListener('animationend', finishClose);
  };

  if (doc?.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', activateHubLayout, { once: true });
  } else {
    activateHubLayout();
  }

  appModules.hub = Object.assign(appModules.hub || {}, { activateHubLayout });
})(typeof window !== 'undefined' ? window : globalThis);
