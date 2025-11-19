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

  const getStageEl = () => doc?.getElementById('hubStage');
  const getStageSlot = () => doc?.querySelector('#hubStage [data-stage-slot]');
  const getStageCloseBtn = () => doc?.querySelector('#hubStage [data-stage-close]');
  const updateStageLabel = (stage, label) => {
    if (!stage) return;
    const title = stage.querySelector('[data-stage-title]');
    if (title) {
      const fallback = stage.dataset.stageDefault || 'Bitte Modul auswÃ¤hlen.';
      title.textContent = label || fallback;
    }
  };
  const showStageBox = (label) => {
    const stage = getStageEl();
    if (!stage) return;
    stage.hidden = false;
    stage.setAttribute('aria-hidden', 'false');
    updateStageLabel(stage, label);
  };
  const hideStageBox = () => {
    const stage = getStageEl();
    if (!stage) return;
    stage.hidden = true;
    stage.setAttribute('aria-hidden', 'true');
    updateStageLabel(stage);
    delete stage.dataset.activeOverlay;
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
    setupDatePill(hub);
    moveIntakePillsToHub();
    setupChat(hub);
    setupStageClose();
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

    const bindButton = (selector, handler, { sync = true } = {}) => {
      const btn = hub.querySelector(selector);
      if (!btn) return;
      const run = () => handler(btn);
      btn.addEventListener('click', () => {
        if (sync) syncPressed(btn);
        run();
      });
      btn.addEventListener(
        'pointerdown',
        (event) => {
          if (event.pointerType === 'touch') {
            event.preventDefault();
            if (sync) syncPressed(btn);
            run();
          }
        },
        { passive: false }
      );
    };

    const openStageOverlay = (overlayId) => (btn) => {
      openSimpleOverlay(overlayId, btn);
    };

    bindButton('[data-hub-module="intake"]', openStageOverlay('hubIntakeOverlay'));
    bindButton('[data-hub-module="vitals"]', openStageOverlay('hubVitalsOverlay'));
    bindButton('[data-hub-module="doctor"]', openStageOverlay('hubDoctorOverlay'));
    bindButton('#helpToggle', () => {}, { sync: false });
    bindButton('#diagToggle', () => {}, { sync: false });
  };
  const setupStageClose = () => {\r\n    const btn = getStageCloseBtn();\r\n    if (!btn) return;\r\n    btn.addEventListener('click', () => {\r\n      const stage = getStageEl();\r\n      const active = stage?.dataset.activeOverlay;\r\n      if (active) {\r\n        closeSimpleOverlay(active);\r\n      } else {\r\n        hideStageBox();\r\n      }\r\n    });\r\n  };\r\n\r\n  const setupChat = (hub) => {
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
    const slot = getStageSlot();
    const stage = getStageEl();
    const body = overlay?.querySelector('.hub-overlay-body');
    if (!overlay || !slot || !stage || !body) return null;

    const active = stage.dataset.activeOverlay;
    if (active && active !== overlayId) {
      closeSimpleOverlay(active);
    } else if (active === overlayId) {
      return overlay;
    }

    overlay._bodyParent = body.parentElement;
    overlay._bodyNext = body.nextSibling;
    slot.innerHTML = '';
    slot.appendChild(body);

    const header = overlay.querySelector('.hub-overlay-header');
    const headerTitle = header?.querySelector('h2')?.textContent?.trim();
    overlay._headerHidden = header ? header.hidden : false;
    if (header) header.hidden = true;

    const label =
      headerTitle ||
      trigger?.querySelector('.sr-only')?.textContent?.trim() ||
      body.getAttribute('aria-label') ||
      overlay.getAttribute('aria-label') ||
      '';
    stage.dataset.activeOverlay = overlayId;
    showStageBox(label);

    const escHandler = (event) => {
      if (event.key === 'Escape') {
        closeSimpleOverlay(overlayId);
      }
    };
    overlay._escHandler = escHandler;
    doc.addEventListener('keydown', escHandler);

    overlay._open = true;
    return overlay;
  };

  const closeSimpleOverlay = (overlayId) => {
    if (!doc) return;
    const overlay = doc.getElementById(overlayId);
    const stage = getStageEl();
    if (!overlay || !overlay._open) return;

    const slot = getStageSlot();
    const body = slot?.querySelector('.hub-overlay-body');
    if (body) {
      if (overlay._bodyNext && overlay._bodyNext.parentNode === overlay._bodyParent) {
        overlay._bodyParent.insertBefore(body, overlay._bodyNext);
      } else if (overlay._bodyParent) {
        overlay._bodyParent.appendChild(body);
      }
    }
    if (slot) slot.innerHTML = '';

    const header = overlay.querySelector('.hub-overlay-header');
    if (header) {
      header.hidden = overlay._headerHidden || false;
    }

    if (overlay._escHandler) {
      doc.removeEventListener('keydown', overlay._escHandler);
      overlay._escHandler = null;
    }

    overlay._open = false;
    if (stage?.dataset.activeOverlay === overlayId) {
      hideStageBox();
    }
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




