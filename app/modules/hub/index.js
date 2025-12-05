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
  const SUPABASE_PROJECT_URL = 'https://jlylmservssinsavlkdi.supabase.co';
  const MIDAS_ENDPOINTS = (() => {
    const base = `${SUPABASE_PROJECT_URL}/functions/v1`;
    if (global.location?.hostname?.includes('github.io')) {
      return {
        assistant: `${base}/midas-assistant`,
        transcribe: `${base}/midas-transcribe`,
        tts: `${base}/midas-tts`,
        vision: `${base}/midas-vision`,
      };
    }
    return {
      assistant: '/api/midas-assistant',
      transcribe: '/api/midas-transcribe',
      tts: '/api/midas-tts',
      vision: '/api/midas-vision',
    };
  })();
  const DIRECT_SUPABASE_CALL = Object.values(MIDAS_ENDPOINTS).some((url) =>
    typeof url === 'string' && url.includes('.supabase.co/'),
  );

  const ORBIT_BUTTONS = {
    north: { angle: -90 },
    ne: { angle: -45, radiusScale: 0.88 },
    e: { angle: 0 },
    se: { angle: 45, radiusScale: 0.88 },
    s: { angle: 90 },
    sw: { angle: 135, radiusScale: 0.88 },
    w: { angle: 180 },
    nw: { angle: -135, radiusScale: 0.88 },
    core: { angle: 0, radiusScale: 0 },
  };
  const VOICE_STATE_LABELS = {
    idle: 'Bereit',
    listening: 'Ich hoere zu',
    thinking: 'Verarbeite',
    speaking: 'Spreche',
    error: 'Fehler',
  };
  const VOICE_FALLBACK_REPLY = 'Hallo Stephan, ich bin bereit.';
  const MAX_ASSISTANT_PHOTO_BYTES = 6 * 1024 * 1024;
  const VAD_SILENCE_MS = 1000;
  const CONVERSATION_AUTO_RESUME_DELAY = 450;
  const END_PHRASES = [
/nein danke/i,
    /danke[, ]?(das)? war( es|)?/i,
    /(das )?(war'?|ist) alles/i,
    /passt[, ]?(danke)?/i,
    /danke[, ]?(das )?passt/i,
    /fertig/i,
    /alles erledigt/i,
    /nein[, ]?(alles )?(erledigt|gut|fertig)/i,
    /stop(p)?/i,
    /tsch[üu]ss/i,
    /ciao/i,

    // --- Neue, für dich typische Varianten ---
    /passt so/i,
    /passt scho/i,
    /jo passt/i,
    /eh passt/i,
    /alles gut/i,
    /passt eh/i,
    /passt für mich/i,
    /mehr brauch ich nicht/i,
    /brauch nichts mehr/i,
    /brauch (ich )?sonst nix/i,
    /nix mehr/i,
    /nichts mehr/i,
    /keine ahnung, passt/i,   // du sagst das öfter scherzhaft
    /das wärs?/i,
    /des wars/i,             // dein Dialekt kommt bei dir durch :)
    /bin fertig/i,
    /eh fertig/i,
    /jo eh/i,
    /reicht/i,
    /reicht schon/i,
    /genug/i,
    /ok passt/i,
    /passt danke dir/i,
    /passt danke dir eh/i,
    /passt eh danke/i,
    /gut is/i,
    /is gut/i,
    /schon gut/i,
    /ja, danke dir/i,
    /ja passt/i,
    /ja danke passt/i,
    /fürs erste passts/i,
    /für jetzt passts/i,
    /alles gut danke/i,
    /nein passt eh/i,
    /ne passt/i,
    /passt schon danke/i,
    /ok danke/i,
    /jo danke/i,
    /gut so/i,
    /oke? passt/i,
    /gut, danke/i,
    /passt, erledigt/i,
    /alles erledigt danke/i
  ];
  const END_ACTIONS = ['endSession', 'closeConversation'];
  const HUB_DEBUG_ENABLED = !!appModules.config?.LOG_HUB_DEBUG;

  let hubButtons = [];
  let activePanel = null;
  let setSpriteStateFn = null;
  let doctorUnlockWaitCancel = null;
  let openDoctorPanelWithGuard = null;
  let voiceCtrl = null;
  let assistantChatCtrl = null;
  let supabaseFunctionHeadersPromise = null;

  const getSupabaseApi = () => appModules.supabase || {};
  const getAssistantUiHelpers = () =>
    appModules.assistantUi ||
    appModules.assistant?.ui ||
    global.AppModules?.assistantUi ||
    null;

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

  const getChartPanel = () => global.AppModules?.charts?.chartPanel;

  const closeActivePanel = ({ skipButtonSync = false, instant = false } = {}) => {
    if (!activePanel) return;
    const panel = activePanel;
    const panelName = panel.dataset?.hubPanel || 'unknown';
    diag.add?.(`[hub] close panel ${panelName} instant=${instant}`);
    if (panelName === 'doctor') {
      if (typeof doctorUnlockWaitCancel === 'function') {
        diag.add?.('[hub] doctor close -> cancel pending unlock wait');
        try { doctorUnlockWaitCancel(false); } catch (_) {}
      }
      const chartPanel = getChartPanel();
      if (chartPanel?.open) {
        diag.add?.('[hub] doctor close -> chart still open, hiding chart first');
        try {
          chartPanel.hide();
        } catch (err) {
          console.warn('[hub] chartPanel.hide failed', err);
        }
      }
    }

    const activeEl = doc?.activeElement;
    if (activeEl && typeof activeEl.blur === 'function' && panel.contains(activeEl)) {
      try { activeEl.blur(); } catch (_) {}
    }

    const finish = () => {
      panel.removeEventListener('animationend', handleAnimationEnd);
      if (panel._hubCloseTimer) {
        global.clearTimeout(panel._hubCloseTimer);
        panel._hubCloseTimer = null;
      }
      panel.classList.remove('hub-panel-closing', 'hub-panel-open', 'is-visible');
      panel.hidden = true;
      panel.setAttribute('aria-hidden', 'true');
      panel.setAttribute('inert', '');
      panel.setAttribute('inert', '');
      panel.setAttribute('inert', '');
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

    if (instant) {
      finish();
      return;
    }

    panel.classList.remove('hub-panel-open');
    panel.classList.add('hub-panel-closing');
    panel.setAttribute('aria-hidden', 'true');
    panel.hidden = false;
    panel.addEventListener('animationend', handleAnimationEnd);
    panel._hubCloseTimer = global.setTimeout(finish, 1200);
  };
  const forceClosePanelByName = (panelName, { instant = true } = {}) => {
    const target = doc?.querySelector(`[data-hub-panel="${panelName}"]`);
    if (!target) return false;
    activePanel = target;
    closeActivePanel({ skipButtonSync: false, instant });
    return true;
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
    diag.add?.(`[hub] openPanel ${panelName}`);
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
    panel.removeAttribute('inert');
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
      panel.setAttribute('inert', '');
      const closeMode = panel.dataset.closeMode || '';
      panel.querySelectorAll('[data-panel-close]').forEach((btn) => {
        const mode = btn.dataset.closeMode || closeMode;
        btn.addEventListener('click', (event) => {
          event?.preventDefault();
          event?.stopPropagation();
          diag.add?.(
            `[hub] close button ${panel.dataset.hubPanel || 'unknown'} mode=${mode}`
          );
          closeActivePanel({ instant: mode === 'instant' });
        });
      });
    });
  };

  const ensureDoctorUnlocked = async () => {
    const supa = getSupabaseApi();
    const unlockFn = supa?.requireDoctorUnlock;
    if (typeof unlockFn !== 'function') {
      diag.add?.('[hub] doctor unlock bypassed (no guard fn)');
      return true;
    }
    try {
      diag.add?.('[hub] doctor unlock start');
      const ok = await unlockFn();
      diag.add?.(`[hub] doctor unlock result=${ok ? 'ok' : 'cancelled'}`);
      return !!ok;
    } catch (err) {
      console.warn('[hub] doctor unlock failed', err);
      diag.add?.('[hub] doctor unlock failed: ' + (err?.message || err));
      return false;
    }
  };

  const waitForDoctorUnlock = ({ guardState, timeout = 60000 } = {}) =>
    new Promise((resolve) => {
      const state = guardState || getSupabaseApi()?.authGuardState;
      diag.add?.(
        `[hub] waitForDoctorUnlock start timeout=${timeout} state=${state ? 'yes' : 'no'}`
      );
      if (!state) {
        diag.add?.('[hub] waitForDoctorUnlock aborted (no guardState)');
        resolve(false);
        return;
      }
      if (state.doctorUnlocked) {
        diag.add?.('[hub] waitForDoctorUnlock skip (already unlocked)');
        resolve(true);
        return;
      }
      const interval = 200;
      let elapsed = 0;
      if (doctorUnlockWaitCancel) {
        diag.add?.('[hub] waitForDoctorUnlock cancelling previous wait');
        doctorUnlockWaitCancel(false);
      }
      let finished = false;
      let timerId = null;
      let cancelFn;
      const cleanup = (result, reason = 'resolved') => {
        if (finished) return;
        finished = true;
        diag.add?.(
          `[hub] waitForDoctorUnlock finish reason=${reason} result=${result ? 'success' : 'fail'}`
        );
        if (timerId) {
          global.clearInterval(timerId);
          timerId = null;
        }
        if (doctorUnlockWaitCancel === cancelFn) {
          doctorUnlockWaitCancel = null;
        }
        resolve(result);
      };
      cancelFn = (result = false) => cleanup(result, 'manual-cancel');
      timerId = global.setInterval(() => {
        if (state.doctorUnlocked) {
          cleanup(true, 'state-change');
          return;
        }
        elapsed += interval;
        if (elapsed >= timeout) {
          cleanup(false, 'timeout');
        }
      }, interval);
      doctorUnlockWaitCancel = cancelFn;
    });

  const isBootReady = () => doc?.body?.dataset?.bootStage === 'idle';

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
    setupVoiceChat(hub);
    setupAssistantChat(hub);
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
        if (!isBootReady()) return;
        if (sync) syncButtonState(btn);
        try {
          await handler(btn);
        } catch (err) {
          console.error('[hub] button handler failed', err);
          if (sync) syncButtonState(null);
        }
      };
      btn.addEventListener('click', () => {
        if (!isBootReady()) return;
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
    bindButton(
      '[data-hub-module="appointments"]',
      async (btn) => {
        await openPanelHandler('appointments')(btn);
        try {
          await appModules.appointments?.sync?.({ reason: 'panel-open' });
        } catch (err) {
          diag.add?.(`[hub] appointments sync failed: ${err?.message || err}`);
        }
      },
      { sync: false },
    );
    const openAssistantPanel = async (btn) => {
      await openPanelHandler('assistant-text')(btn);
      if (activePanel?.dataset?.hubPanel !== 'assistant-text') return;
      refreshAssistantContext({ reason: 'assistant:panel-open' });
    };

    const bindAssistantButton = () => {
      const btn = hub.querySelector('[data-hub-module="assistant-text"]');
      if (!btn) return;
      const LONG_PRESS_MS = 650;
      let pressTimer = null;
      let longPressTriggered = false;
      let swallowNextClick = false;

      const resetTimer = () => {
        if (pressTimer) {
          global.clearTimeout(pressTimer);
          pressTimer = null;
        }
      };

      const markClickSwallowed = () => {
        swallowNextClick = true;
        global.setTimeout(() => {
          swallowNextClick = false;
        }, 0);
      };

      const triggerVoice = () => {
        if (longPressTriggered) return;
        longPressTriggered = true;
        markClickSwallowed();
        handleVoiceTrigger();
      };

      const handlePointerDown = (event) => {
        if (!isBootReady()) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        longPressTriggered = false;
        resetTimer();
        pressTimer = global.setTimeout(triggerVoice, LONG_PRESS_MS);
      };

      const handlePointerUp = (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (!pressTimer) return;
        resetTimer();
        if (longPressTriggered) return;
        markClickSwallowed();
        openAssistantPanel(btn);
      };

      const cancelPointerHold = () => {
        resetTimer();
      };

      btn.addEventListener('pointerdown', handlePointerDown);
      btn.addEventListener('pointerup', handlePointerUp);
      btn.addEventListener('pointerleave', cancelPointerHold);
      btn.addEventListener('pointercancel', cancelPointerHold);
      btn.addEventListener('click', (event) => {
        if (swallowNextClick) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        openAssistantPanel(btn);
      });
    };

    bindAssistantButton();
    const doctorPanelHandler = openPanelHandler('doctor');
    const openDoctorPanel = async ({ triggerButton = null, onOpened, startMode = 'list' } = {}) => {
      const openFlow = async () => {
        diag.add?.('[hub] openDoctorPanel openFlow start', { startMode });
        await doctorPanelHandler(triggerButton);
        if (startMode === 'chart') {
          const chartBtn = doc?.getElementById('doctorChartBtn');
          if (chartBtn) {
            chartBtn.click();
          } else {
            diag.add?.('[hub] doctor chart button missing for chart mode');
          }
        }
        if (typeof onOpened === 'function') {
          await onOpened();
        }
      };
      if (await ensureDoctorUnlocked()) {
        await openFlow();
        return true;
      }
      const supa = getSupabaseApi();
      const guardState = supa?.authGuardState;
      const unlockedAfter = await waitForDoctorUnlock({ guardState });
      if (unlockedAfter) {
        await openFlow();
        return true;
      }
      return false;
    };
    openDoctorPanelWithGuard = openDoctorPanel;
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
        if (HUB_DEBUG_ENABLED) {
          diag.add?.(`[hub-chat] stub send: ${value}`);
        }
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

  const getCaptureFormatFn = () => {
    const fmt = appModules.capture?.fmtDE;
    if (typeof fmt === 'function') return fmt;
    return (value, digits = 1) => {
      const num = Number(value) || 0;
      return num.toFixed(digits).replace('.', ',');
    };
  };

  const updateAssistantPill = (key, text, isActive) => {
    const pill = assistantChatCtrl?.pills?.[key];
    if (!pill) return;
    pill.value.textContent = text;
    if (isActive) pill.root.classList.remove('muted');
    else pill.root.classList.add('muted');
  };

  const renderAssistantIntakeTotals = (snapshot) => {
    const logged = !!snapshot?.logged;
    const totals = snapshot?.totals || {};
    const fmt = getCaptureFormatFn();
    const waterText = logged ? `${Math.round(Number(totals.water_ml) || 0)} ml` : '-- ml';
    const saltText = logged ? `${fmt(totals.salt_g, 1)} g` : '-- g';
    const proteinText = logged ? `${fmt(totals.protein_g, 1)} g` : '-- g';
    updateAssistantPill('water', waterText, logged);
    updateAssistantPill('salt', saltText, logged);
    updateAssistantPill('protein', proteinText, logged);
  };

  const renderAssistantAppointments = (items) => {
    const refs = assistantChatCtrl?.appointments;
    if (!refs?.container) return;
    const hasItems = Array.isArray(items) && items.length > 0;
    if (refs.list) {
      if (hasItems) {
        refs.list.hidden = false;
        refs.list.innerHTML = items
          .map(
            (item) =>
              `<li><span>${item.label || ''}</span><span>${item.detail || ''}</span></li>`,
          )
          .join('');
      } else {
        refs.list.hidden = true;
        refs.list.innerHTML = '';
      }
    }
    if (refs.empty) {
      if (hasItems) refs.empty.setAttribute('hidden', 'true');
      else {
        refs.empty.removeAttribute('hidden');
        refs.empty.textContent = 'Keine Termine geladen.';
      }
    }
  };

  const APPOINTMENT_DATE_FORMAT = new Intl.DateTimeFormat('de-AT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit'
  });
  const APPOINTMENT_TIME_FORMAT = new Intl.DateTimeFormat('de-AT', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const formatAppointmentDateTime = (value) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const dayLabel = APPOINTMENT_DATE_FORMAT.format(date).replace(/\.$/, '');
    const timeLabel = APPOINTMENT_TIME_FORMAT.format(date);
    return `${dayLabel} • ${timeLabel}`;
  };

  const normalizeAppointmentItems = (items, limit = 2) => {
    if (!Array.isArray(items)) return [];
    const normalized = [];
    items.some((raw, index) => {
      if (!raw) return false;
      const id =
        raw.id ||
        raw.appointment_id ||
        raw.remote_id ||
        raw.slug ||
        `appt-${index}`;
      let label =
        raw.label ||
        raw.title ||
        raw.name ||
        raw.doctor ||
        raw.summary ||
        raw.type ||
        '';
      let detail =
        raw.detail ||
        raw.subtitle ||
        raw.when ||
        raw.dateLabel ||
        '';
      if (!detail && (raw.start || raw.date)) {
        detail = formatAppointmentDateTime(raw.start || raw.date);
      } else if (!detail && raw.day && raw.time) {
        detail = `${raw.day} • ${raw.time}`;
      }
      if (!label && detail) label = 'Termin';
      if (!label && !detail) return false;
      normalized.push({ id, label, detail });
      return normalized.length >= limit;
    });
    return normalized.slice(0, limit);
  };

  const fetchAssistantAppointments = async ({ limit = 2, reason } = {}) => {
    const provider = appModules.appointments;
    if (!provider) return [];
    const getter =
      typeof provider.getUpcoming === 'function'
        ? provider.getUpcoming
        : typeof provider.getUpcomingAppointments === 'function'
          ? provider.getUpcomingAppointments
          : null;
    if (!getter) return [];
    try {
      const result = await getter.call(provider, limit, { reason });
      return normalizeAppointmentItems(result, limit);
    } catch (err) {
      diag.add?.(`[assistant-context] appointments fetch failed: ${err?.message || err}`);
      return [];
    }
  };

  const loadAssistantIntakeSnapshot = async ({ reason, forceRefresh = false } = {}) => {
    const captureApi = appModules.capture || {};
    let snapshot = null;
    if (typeof captureApi.fetchTodayIntakeTotals === 'function') {
      try {
        snapshot = await captureApi.fetchTodayIntakeTotals({
          reason,
          forceRefresh,
        });
      } catch (err) {
        diag.add?.(
          `[assistant-context] intake fetch failed: ${err?.message || err}`,
        );
      }
    }
    if (!snapshot && typeof captureApi.getCaptureIntakeSnapshot === 'function') {
      snapshot = captureApi.getCaptureIntakeSnapshot();
    }
    if (!snapshot && global.AppModules?.captureGlobals?.captureIntakeState) {
      const state = global.AppModules.captureGlobals.captureIntakeState;
      snapshot = {
        dayIso: state.dayIso,
        logged: !!state.logged,
        totals: {
          water_ml: Number(state.totals?.water_ml) || 0,
          salt_g: Number(state.totals?.salt_g) || 0,
          protein_g: Number(state.totals?.protein_g) || 0,
        },
      };
    }
    return snapshot;
  };

  const refreshAssistantContext = async ({ reason, forceRefresh = false } = {}) => {
    if (!assistantChatCtrl?.panel) return;
    const [snapshot, appointments] = await Promise.all([
      loadAssistantIntakeSnapshot({ reason, forceRefresh }),
      fetchAssistantAppointments({ limit: 2, reason }),
    ]);
    renderAssistantIntakeTotals(snapshot);
    renderAssistantAppointments(appointments);
  };

  let assistantChatSetupAttempts = 0;
  const ASSISTANT_CHAT_MAX_ATTEMPTS = 10;
  const ASSISTANT_CHAT_RETRY_DELAY = 250;
  const debugLog = (msg, payload) => {
    if (!HUB_DEBUG_ENABLED) return;
    diag.add?.(`[hub:debug] ${msg}` + (payload ? ` ${JSON.stringify(payload)}` : ''));
  };

  const setupAssistantChat = (hub) => {
    debugLog('assistant-chat setup');
    if (assistantChatCtrl) {
      debugLog('assistant-chat controller already initialised');
      return;
    }
    const panel = doc?.getElementById('hubAssistantPanel');
    if (!panel) {
      assistantChatSetupAttempts += 1;
      if (assistantChatSetupAttempts === 1) {
        debugLog('assistant-chat panel missing, retrying …');
      }
      if (assistantChatSetupAttempts < ASSISTANT_CHAT_MAX_ATTEMPTS) {
        global.setTimeout(() => setupAssistantChat(hub), ASSISTANT_CHAT_RETRY_DELAY);
      } else {
        diag.add?.('[assistant-chat] panel missing nach wiederholten Versuchen');
      }
      return;
    }
    assistantChatSetupAttempts = 0;
    debugLog('assistant-chat panel found');
    const chatEl = panel.querySelector('#assistantChat');
    const form = panel.querySelector('#assistantChatForm');
    const input = panel.querySelector('#assistantMessage');
    const sendBtn = panel.querySelector('#assistantSendBtn');
    const cameraBtn = panel.querySelector('#assistantCameraBtn');
    const clearBtn = panel.querySelector('#assistantClearChat');
    const messageTemplate = panel.querySelector('#assistantMessageTemplate');
    const photoTemplate = panel.querySelector('#assistantPhotoTemplate');
    const pillsWrap = panel.querySelector('#assistantIntakePills');
    const buildPillRef = (key) => {
      const root = pillsWrap?.querySelector(`[data-pill="${key}"]`);
      if (!root) return null;
      const value = root.querySelector('[data-pill-value]');
      if (!value) return null;
      return { root, value };
    };
    const appointmentsContainer = panel.querySelector('#assistantAppointments');
    const appointmentsList = panel.querySelector('#assistantAppointmentsList');
    const appointmentsEmpty = appointmentsContainer?.querySelector('[data-appointments-empty]');

    const photoInput = doc.createElement('input');
    photoInput.type = 'file';
    photoInput.accept = 'image/*';
    photoInput.hidden = true;
    panel.appendChild(photoInput);

    if (messageTemplate) messageTemplate.remove();
    if (photoTemplate) photoTemplate.remove();

    assistantChatCtrl = {
      panel,
      chatEl,
      form,
      input,
      sendBtn,
      cameraBtn,
      clearBtn,
      photoInput,
      pills: {
        water: buildPillRef('water'),
        salt: buildPillRef('salt'),
        protein: buildPillRef('protein'),
      },
      appointments: {
        container: appointmentsContainer,
        list: appointmentsList,
        empty: appointmentsEmpty,
      },
      templates: {
        message: messageTemplate?.content?.firstElementChild || null,
        photo: photoTemplate?.content?.firstElementChild || null,
      },
      messages: [],
      sessionId: null,
      sending: false,
    };

    debugLog('assistant-chat controller ready');

    form?.addEventListener(
      'submit',
      (event) => {
        debugLog('assistant-chat form submit');
      },
      true,
    );
    sendBtn?.addEventListener('click', () => {
      debugLog('assistant-chat send button click');
    });

    chatEl?.addEventListener('click', handleAssistantChatClick);
    form?.addEventListener('submit', handleAssistantChatSubmit);
    clearBtn?.addEventListener('click', () => resetAssistantChat(true));
    photoInput.addEventListener('change', handleAssistantPhotoSelected, false);
    bindAssistantCameraButton(cameraBtn, photoInput);
    resetAssistantChat();
    debugLog('assistant-chat setup complete');
    refreshAssistantContext({ reason: 'assistant:init', forceRefresh: false });

    doc?.addEventListener('appointments:changed', () => {
      refreshAssistantContext({ reason: 'appointments:changed', forceRefresh: true });
    });
  };

  const bindAssistantCameraButton = (btn, input) => {
    if (!btn || !input) return;
    const LONG_PRESS_MS = 650;
    let pressTimer = null;
    let longPressTriggered = false;

    const resetTimer = () => {
      if (pressTimer) {
        global.clearTimeout(pressTimer);
        pressTimer = null;
      }
    };

    const openSelector = ({ capture }) => {
      input.value = '';
      if (capture) {
        input.setAttribute('capture', capture);
      } else {
        input.removeAttribute('capture');
      }
      input.click();
    };

    const handlePointerDown = (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      longPressTriggered = false;
      resetTimer();
      pressTimer = global.setTimeout(() => {
        longPressTriggered = true;
        openSelector({ capture: null });
      }, LONG_PRESS_MS);
    };

    const handlePointerUp = (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (!pressTimer) return;
      resetTimer();
      if (!longPressTriggered) {
        openSelector({ capture: 'environment' });
      }
    };

    const cancelPress = () => {
      resetTimer();
    };

    btn.addEventListener('pointerdown', handlePointerDown);
    btn.addEventListener('pointerup', handlePointerUp);
    btn.addEventListener('pointerleave', cancelPress);
    btn.addEventListener('pointercancel', cancelPress);
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  };

  const handleAssistantPhotoSelected = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;
    if (file.size > MAX_ASSISTANT_PHOTO_BYTES) {
      const maxMb = (MAX_ASSISTANT_PHOTO_BYTES / (1024 * 1024)).toFixed(1);
      diag.add?.(
        `[assistant-vision] foto zu groß: ${(file.size / (1024 * 1024)).toFixed(2)} MB`,
      );
      appendAssistantMessage('system', `Das Foto ist zu groß (max. ca. ${maxMb} MB).`);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await sendAssistantPhotoMessage(dataUrl, file);
    } catch (err) {
      console.error('[assistant-chat] foto konnte nicht gelesen werden', err);
      diag.add?.(`[assistant-vision] foto konnte nicht gelesen werden: ${err?.message || err}`);
      appendAssistantMessage('system', 'Das Foto konnte nicht gelesen werden.');
    }
  };

  const resetAssistantChat = (focusInput = false) => {
    if (!assistantChatCtrl) return;
    assistantChatCtrl.messages = [];
    assistantChatCtrl.sessionId = null;
    renderAssistantChat();
    setAssistantSending(false);
    if (focusInput) {
      assistantChatCtrl.input?.focus();
    }
  };

  const ensureAssistantSession = () => {
    if (!assistantChatCtrl) return;
    if (!assistantChatCtrl.sessionId) {
      assistantChatCtrl.sessionId = `text-${Date.now()}`;
      debugLog('assistant-chat new session');
    }
  };

  const handleAssistantChatSubmit = (event) => {
    event.preventDefault();
    if (!assistantChatCtrl) return;
    const value = assistantChatCtrl.input?.value?.trim();
    if (!value) return;
    debugLog('assistant-chat submit');
    sendAssistantChatMessage(value);
  };

  const sendAssistantChatMessage = async (text) => {
    if (!assistantChatCtrl || assistantChatCtrl.sending) return;
    debugLog('assistant-chat send start');
    ensureAssistantSession();
    appendAssistantMessage('user', text);
    if (assistantChatCtrl.input) {
      assistantChatCtrl.input.value = '';
    }
    setAssistantSending(true);
    try {
      const reply = await fetchAssistantTextReply();
      if (reply) {
        appendAssistantMessage('assistant', reply);
      } else {
        appendAssistantMessage('assistant', 'Ich habe nichts empfangen.');
      }
    } catch (err) {
      console.error('[assistant-chat] request failed', err);
      if (err?.message === 'supabase-headers-missing') {
        appendAssistantMessage(
          'system',
          'Supabase-Konfiguration fehlt. Bitte REST-Endpoint + Key speichern.',
        );
      } else {
        appendAssistantMessage('system', 'Assistant nicht erreichbar.');
      }
    } finally {
      setAssistantSending(false);
      debugLog('assistant-chat send end');
    }
  };

  const appendAssistantMessage = (role, content, extras = {}) => {
    if (!assistantChatCtrl) return null;
    const message = {
      role: role === 'assistant' ? 'assistant' : role === 'system' ? 'system' : 'user',
      content: content?.trim?.() || '',
      id: extras.id || `m-${Date.now()}-${assistantChatCtrl.messages.length}`,
      imageData: extras.imageData || null,
      meta: extras.meta || null,
      type: extras.type || 'text',
      status: extras.status || null,
      resultText: extras.resultText || '',
      retryable: !!extras.retryable,
      retryPayload: extras.retryPayload || null,
    };
    assistantChatCtrl.messages.push(message);
    renderAssistantChat();
    return message;
  };

  const cloneAssistantTemplate = (key) => {
    const tmpl = assistantChatCtrl?.templates?.[key];
    if (!tmpl) return null;
    return tmpl.cloneNode(true);
  };

  const renderAssistantChat = () => {
    if (!assistantChatCtrl?.chatEl) return;
    const container = assistantChatCtrl.chatEl;
    container.innerHTML = '';
    if (!assistantChatCtrl.messages.length) {
      const placeholder = doc.createElement('div');
      placeholder.className = 'assistant-chat-empty';
      placeholder.innerHTML = '<p class="muted">Starte eine Unterhaltung oder schicke ein Foto deines Essens.</p>';
      container.appendChild(placeholder);
      return;
    }
    const frag = doc.createDocumentFragment();
    assistantChatCtrl.messages.forEach((message) => {
      let bubble;
      if (message.type === 'photo') {
        bubble = cloneAssistantTemplate('photo');
        if (!bubble) {
          bubble = doc.createElement('div');
        }
        bubble.classList.add('assistant-photo-bubble');
        const figure = bubble.querySelector('.assistant-photo');
        const img = figure?.querySelector('img');
        if (img) {
          img.src = message.imageData || '';
          img.alt = message.meta?.fileName ? `Foto ${message.meta.fileName}` : 'Hochgeladenes Foto';
        }
        const statusEl = bubble.querySelector('.assistant-photo-status');
        if (statusEl) {
          const statusText =
            message.status === 'error'
              ? 'Analyse fehlgeschlagen.'
              : message.status === 'done'
                ? 'Analyse abgeschlossen.'
                : 'Analyse läuft …';
          statusEl.textContent = statusText;
        }
        const resultEl = bubble.querySelector('.assistant-photo-result');
        if (resultEl) {
          resultEl.textContent =
            message.resultText || (message.status === 'done' ? 'Keine Details verfügbar.' : 'Noch kein Ergebnis.');
          if (message.status === 'error') {
            resultEl.classList.remove('muted');
          } else {
            resultEl.classList.add('muted');
          }
        }
        bubble.classList.toggle('is-processing', message.status !== 'done' && message.status !== 'error');
        bubble.classList.toggle('is-error', message.status === 'error');
        if (message.retryable) {
          const retryWrap = doc.createElement('div');
          retryWrap.className = 'assistant-photo-retry';
          const retryLabel = doc.createElement('span');
          retryLabel.textContent = 'Erneut versuchen?';
          const retryBtn = doc.createElement('button');
          retryBtn.type = 'button';
          retryBtn.textContent = 'Nochmal analysieren';
          retryBtn.setAttribute('data-assistant-retry-id', message.id);
          retryWrap.appendChild(retryLabel);
          retryWrap.appendChild(retryBtn);
          bubble.appendChild(retryWrap);
        }
      } else {
        bubble = cloneAssistantTemplate('message');
        if (!bubble) {
          bubble = doc.createElement('div');
          bubble.className = 'assistant-bubble';
        }
        const textLine = bubble.querySelector('.assistant-text-line');
        if (textLine) {
          textLine.textContent = message.content;
        } else if (message.content) {
          const text = doc.createElement('p');
          text.className = 'assistant-text-line';
          text.textContent = message.content;
          bubble.appendChild(text);
        }
      }
      bubble.classList.add(`assistant-${message.role}`);
      bubble.setAttribute('data-role', message.role);
      frag.appendChild(bubble);
    });
    container.appendChild(frag);
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    });
  };

  const setAssistantSending = (state) => {
    if (!assistantChatCtrl) return;
    assistantChatCtrl.sending = !!state;
    if (assistantChatCtrl.sending) {
      assistantChatCtrl.sendBtn?.setAttribute('disabled', 'disabled');
      assistantChatCtrl.input?.setAttribute('disabled', 'disabled');
      assistantChatCtrl.cameraBtn?.setAttribute('disabled', 'disabled');
    } else {
      assistantChatCtrl.sendBtn?.removeAttribute('disabled');
      assistantChatCtrl.input?.removeAttribute('disabled');
      assistantChatCtrl.cameraBtn?.removeAttribute('disabled');
      assistantChatCtrl.input?.focus();
    }
  };

  const fetchAssistantTextReply = async () => {
    ensureAssistantSession();
    if (!assistantChatCtrl) return '';
    const payload = {
      session_id: assistantChatCtrl.sessionId ?? `text-${Date.now()}`,
      mode: 'text',
      messages: assistantChatCtrl.messages
        .filter((msg) => msg.role === 'assistant' || msg.role === 'user')
        .map((msg) => ({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
        })),
    };
    let response;
    const headers = await buildFunctionJsonHeaders();
    try {
      response = await fetch(MIDAS_ENDPOINTS.assistant, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
    } catch (networkErr) {
      throw networkErr;
    }
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(errText || 'assistant failed');
    }
    const data = await response.json().catch(() => ({}));
    const reply = (data?.reply || '').trim();
    return reply;
  };

  const sendAssistantPhotoMessage = async (dataUrl, file, existingMessage = null) => {
    if (!assistantChatCtrl || assistantChatCtrl.sending) return;
    ensureAssistantSession();
    const resolvedDataUrl =
      dataUrl ||
      existingMessage?.retryPayload?.base64 ||
      existingMessage?.imageData ||
      '';
    const assistantUi = getAssistantUiHelpers();
    const basePayload =
      assistantUi?.createPhotoMessageModel?.({
        imageData: resolvedDataUrl,
        fileName: file?.name || existingMessage?.meta?.fileName || ''
      }) || {
        type: 'photo',
        status: 'processing',
        resultText: 'Noch kein Ergebnis.',
        imageData: resolvedDataUrl,
        meta: { fileName: file?.name || existingMessage?.meta?.fileName || '' },
        retryPayload: { base64: resolvedDataUrl, fileName: file?.name || existingMessage?.meta?.fileName || '' },
        retryable: false
      };
    const targetMessage =
      existingMessage || appendAssistantMessage('user', '', basePayload);
    if (!targetMessage) return;
    targetMessage.status = 'processing';
    targetMessage.resultText = 'Analyse läuft …';
    targetMessage.retryable = false;
    targetMessage.retryPayload =
      targetMessage.retryPayload || { base64: resolvedDataUrl, fileName: file?.name || targetMessage.meta?.fileName || '' };
    renderAssistantChat();
    setAssistantSending(true);
    diag.add?.('[assistant-vision] analyse start');
    try {
      const result = await fetchAssistantVisionReply(resolvedDataUrl, file);
      targetMessage.status = 'done';
      targetMessage.resultText = formatAssistantVisionResult(result);
      targetMessage.content = '';
      targetMessage.retryable = false;
      diag.add?.('[assistant-vision] analyse success');
    } catch (err) {
      console.error('[assistant-chat] vision request failed', err);
      diag.add?.(
        `[assistant-vision] analyse failed: ${err?.message || err}`,
      );
      targetMessage.status = 'error';
      targetMessage.resultText = 'Das Foto konnte nicht analysiert werden.';
      targetMessage.retryable = true;
      if (err?.message === 'supabase-headers-missing') {
        appendAssistantMessage(
          'system',
          'Supabase-Konfiguration fehlt. Bitte REST-Endpoint + Key speichern.',
        );
      } else {
        appendAssistantMessage('system', 'Das Foto konnte nicht analysiert werden.');
      }
    } finally {
      setAssistantSending(false);
      renderAssistantChat();
    }
  };

  const fetchAssistantVisionReply = async (dataUrl, file) => {
    ensureAssistantSession();
    if (!assistantChatCtrl) {
      throw new Error('vision-unavailable');
    }
    const base64 = (dataUrl.includes(',') ? dataUrl.split(',').pop() : dataUrl)?.trim() || '';
    if (!base64) {
      throw new Error('vision-image-missing');
    }
    const payload = {
      session_id: assistantChatCtrl.sessionId ?? `text-${Date.now()}`,
      mode: 'vision',
      history: buildAssistantPhotoHistory(),
      image_base64: base64,
    };
    if (!payload.history) {
      delete payload.history;
    }
    if (file?.name) {
      payload.meta = { fileName: file.name };
    }
    const headers = await buildFunctionJsonHeaders();
    let response;
    try {
      response = await fetch(MIDAS_ENDPOINTS.vision, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
    } catch (networkErr) {
      throw networkErr;
    }
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(errText || 'vision-failed');
    }
    const data = await response.json().catch(() => ({}));
    const reply = (data?.reply || '').trim();
    if (!reply) {
      throw new Error('vision-empty');
    }
    return {
      reply,
      analysis: data?.analysis || data?.meta?.analysis || null,
      meta: data?.meta || null,
    };
  };

  const buildAssistantPhotoHistory = () => {
    if (!assistantChatCtrl?.messages?.length) return '';
    const relevant = assistantChatCtrl.messages
      .filter((msg) => (msg.role === 'assistant' || msg.role === 'user') && !msg.imageData)
      .slice(-6);
    if (!relevant.length) return '';
    return relevant
      .map((msg) => `${msg.role === 'assistant' ? 'MIDAS' : 'Stephan'}: ${msg.content}`)
      .join('\n');
  };

  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      const cleanup = () => {
        reader.onload = null;
        reader.onerror = null;
      };
      const fallbackToBuffer = () => {
        cleanup();
        file
          .arrayBuffer()
          .then((buffer) => {
            resolve(arrayBufferToDataUrl(buffer, file.type));
          })
          .catch((bufferErr) => reject(bufferErr));
      };
      reader.onload = () => {
        cleanup();
        resolve(reader.result);
      };
      reader.onerror = (err) => {
        diag.add?.(`[assistant-vision] FileReader fehler: ${err?.message || err}`);
        fallbackToBuffer();
      };
      try {
        reader.readAsDataURL(file);
      } catch (err) {
        diag.add?.(`[assistant-vision] FileReader exception: ${err?.message || err}`);
        fallbackToBuffer();
      }
    });

  const arrayBufferToDataUrl = (buffer, mime = 'application/octet-stream') => {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    const base64 = global.btoa(binary);
    return `data:${mime || 'application/octet-stream'};base64,${base64}`;
  };

  function handleAssistantChatClick(event) {
    const retryBtn = event.target.closest('button[data-assistant-retry-id]');
    if (retryBtn) {
      event.preventDefault();
      const messageId = retryBtn.getAttribute('data-assistant-retry-id');
      retryAssistantPhoto(messageId);
    }
  }

  const retryAssistantPhoto = (messageId) => {
    if (!messageId || !assistantChatCtrl) return;
    const message = assistantChatCtrl.messages.find((msg) => msg.id === messageId);
    if (!message || !message.retryPayload) return;
    sendAssistantPhotoMessage(message.retryPayload.base64, { name: message.retryPayload.fileName || '' }, message);
  };

  const formatAssistantVisionResult = (result) => {
    const assistantUi = getAssistantUiHelpers();
    if (assistantUi?.formatVisionResultText) {
      return assistantUi.formatVisionResultText(result);
    }
    if (!result) return 'Analyse abgeschlossen.';
    const parts = [];
    const analysis = result.analysis || {};
    if (analysis.water_ml != null) {
      parts.push(`Wasser: ${Math.round(Number(analysis.water_ml) || 0)} ml`);
    }
    if (analysis.salt_g != null) {
      parts.push(`Salz: ${(Number(analysis.salt_g) || 0).toFixed(1)} g`);
    }
    if (analysis.protein_g != null) {
      parts.push(`Protein: ${(Number(analysis.protein_g) || 0).toFixed(1)} g`);
    }
    if (result.reply) {
      parts.push(result.reply);
    }
    return parts.join(' • ') || 'Analyse abgeschlossen.';
  };

  const setupVoiceChat = (hub) => {
    const button = hub.querySelector('[data-hub-module="assistant-voice"]');
    if (!button || !navigator?.mediaDevices?.getUserMedia) {
      return;
    }
    voiceCtrl = {
      button,
      status: 'idle',
      recorder: null,
      stream: null,
      chunks: [],
      history: [],
      sessionId: `voice-${Date.now()}`,
      audioEl: null,
      currentAudioUrl: null,
      orbitEl: hub.querySelector('.hub-orbit'),
      audioCtx: null,
      analyser: null,
      mediaSource: null,
      ampData: null,
      ampRaf: null,
      lastAmp: 0,
      vadCtrl: global.MidasVAD?.createController({
        threshold: 0.015,
        minSpeechFrames: 2,
        minSilenceFrames: 8,
        reportInterval: 4,
      }),
      vadSilenceTimer: null,
      lastSpeechAt: 0,
      conversationMode: false,
      conversationEndPending: false,
      pendingResumeTimer: null,
    };
    voiceCtrl.orbitEl?.setAttribute('data-voice-state', 'idle');
    voiceCtrl.orbitEl?.style.setProperty('--voice-amp', '0');
    setVoiceState('idle');
  };

  const setVoiceState = (state, customLabel) => {
    if (!voiceCtrl?.button) return;
    voiceCtrl.status = state;
    const label = customLabel ?? VOICE_STATE_LABELS[state] ?? '';
    voiceCtrl.button.dataset.voiceState = state;
    voiceCtrl.button.dataset.voiceLabel = label;
    voiceCtrl.button.setAttribute('aria-pressed', state === 'listening');
    if (state !== 'idle') {
      clearPendingResume();
    }
    if (state !== 'listening') {
      clearVadSilenceTimer();
    }
    if (voiceCtrl.orbitEl) {
      voiceCtrl.orbitEl.setAttribute('data-voice-state', state);
      if (state !== 'speaking') {
        setVoiceAmplitude(0);
      }
    }
    if (state !== 'speaking') {
      stopVoiceMeter();
    }
  };

  const setVoiceAmplitude = (value) => {
    if (!voiceCtrl?.orbitEl) return;
    const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
    voiceCtrl.orbitEl.style.setProperty('--voice-amp', clamped.toFixed(3));
    voiceCtrl.lastAmp = clamped;
  };

  const ensureVoiceAnalyser = () => {
    if (!voiceCtrl) return false;
    const AudioCtx = global.AudioContext || global.webkitAudioContext;
    if (!AudioCtx) return false;
    if (!voiceCtrl.audioCtx) {
      try {
        voiceCtrl.audioCtx = new AudioCtx();
      } catch (err) {
        console.warn('[hub] AudioContext init failed', err);
        return false;
      }
    }
    if (!voiceCtrl.analyser && voiceCtrl.audioCtx) {
      voiceCtrl.analyser = voiceCtrl.audioCtx.createAnalyser();
      voiceCtrl.analyser.fftSize = 1024;
      voiceCtrl.analyser.smoothingTimeConstant = 0.85;
      voiceCtrl.ampData = new Uint8Array(voiceCtrl.analyser.fftSize);
    }
    const audioEl = ensureVoiceAudioElement();
    if (audioEl && voiceCtrl.audioCtx && !voiceCtrl.mediaSource) {
      try {
        voiceCtrl.mediaSource = voiceCtrl.audioCtx.createMediaElementSource(audioEl);
        voiceCtrl.mediaSource.connect(voiceCtrl.analyser);
        voiceCtrl.analyser.connect(voiceCtrl.audioCtx.destination);
      } catch (err) {
        console.warn('[hub] media source init failed', err);
      }
    }
    return !!voiceCtrl.analyser;
  };

  const startVoiceMeter = async () => {
    if (!voiceCtrl || !ensureVoiceAnalyser()) return;
    try {
      if (voiceCtrl.audioCtx?.state === 'suspended') {
        await voiceCtrl.audioCtx.resume();
      }
    } catch (err) {
      console.warn('[hub] audioCtx resume failed', err);
    }
    if (voiceCtrl.ampRaf) {
      global.cancelAnimationFrame(voiceCtrl.ampRaf);
      voiceCtrl.ampRaf = null;
    }
    const tick = () => {
      if (!voiceCtrl?.analyser || !voiceCtrl.ampData) return;
      voiceCtrl.analyser.getByteTimeDomainData(voiceCtrl.ampData);
      let sum = 0;
      for (let i = 0; i < voiceCtrl.ampData.length; i += 1) {
        sum += Math.abs(voiceCtrl.ampData[i] - 128);
      }
      const avg = sum / voiceCtrl.ampData.length; // 0..128
      const normalized = Math.min(1, avg / 50);
      const smoothed = voiceCtrl.lastAmp * 0.7 + normalized * 0.3;
      setVoiceAmplitude(smoothed);
      voiceCtrl.ampRaf = global.requestAnimationFrame(tick);
    };
    tick();
  };

  const stopVoiceMeter = () => {
    if (voiceCtrl?.ampRaf) {
      global.cancelAnimationFrame(voiceCtrl.ampRaf);
      voiceCtrl.ampRaf = null;
    }
    if (voiceCtrl?.orbitEl) {
      voiceCtrl.orbitEl.style.setProperty('--voice-amp', '0');
    }
    if (voiceCtrl) {
      voiceCtrl.lastAmp = 0;
    }
  };

  const shouldEndConversationFromTranscript = (text) => {
    if (!text) return false;
    const normalized = text.trim();
    if (!normalized) return false;
    return END_PHRASES.some((regex) => regex.test(normalized));
  };

  const clearPendingResume = () => {
    if (voiceCtrl?.pendingResumeTimer) {
      global.clearTimeout(voiceCtrl.pendingResumeTimer);
      voiceCtrl.pendingResumeTimer = null;
    }
  };

  const endConversationSession = () => {
    if (!voiceCtrl) return;
    voiceCtrl.conversationMode = false;
    voiceCtrl.conversationEndPending = false;
    clearPendingResume();
  };

  const scheduleConversationResume = () => {
    if (!voiceCtrl || !voiceCtrl.conversationMode) return;
    clearPendingResume();
    voiceCtrl.pendingResumeTimer = global.setTimeout(() => {
      voiceCtrl.pendingResumeTimer = null;
      if (
        !voiceCtrl ||
        voiceCtrl.status !== 'idle' ||
        voiceCtrl.recorder
      ) {
        return;
      }
      startVoiceRecording();
    }, CONVERSATION_AUTO_RESUME_DELAY);
  };

  const clearVadSilenceTimer = () => {
    if (voiceCtrl?.vadSilenceTimer) {
      global.clearTimeout(voiceCtrl.vadSilenceTimer);
      voiceCtrl.vadSilenceTimer = null;
    }
  };

  const handleVadStateChange = (state) => {
    if (!voiceCtrl || voiceCtrl.status !== 'listening') return;
    if (state === 'speech') {
      voiceCtrl.lastSpeechAt = Date.now();
      clearVadSilenceTimer();
      return;
    }
    if (state === 'silence') {
      if (voiceCtrl.vadSilenceTimer) return;
      voiceCtrl.vadSilenceTimer = global.setTimeout(() => {
        voiceCtrl.vadSilenceTimer = null;
        if (!voiceCtrl || voiceCtrl.status !== 'listening') return;
        if (appModules.config?.DEV_ALLOW_DEFAULTS) {
          diag.add?.('[midas-voice] Auto-stop nach Stille');
        }
        stopVoiceRecording();
      }, VAD_SILENCE_MS);
    }
  };

  const handleVoiceTrigger = () => {
    if (!voiceCtrl) {
      console.warn('[hub] voice controller missing');
      return;
    }
    if (voiceCtrl.button) {
      voiceCtrl.button.classList.add('is-pressed');
      global.setTimeout(() => {
        voiceCtrl?.button?.classList.remove('is-pressed');
      }, 220);
    }
    if (voiceCtrl.status === 'listening') {
      voiceCtrl.conversationMode = false;
      voiceCtrl.conversationEndPending = false;
      clearPendingResume();
      stopVoiceRecording();
      return;
    }
    if (voiceCtrl.status === 'speaking') {
      stopVoicePlayback();
      setVoiceState('idle');
      return;
    }
    if (voiceCtrl.status === 'thinking') {
      diag.add?.('[hub] voice is busy processing');
      return;
    }
    if (voiceCtrl.status === 'idle') {
      voiceCtrl.conversationMode = true;
      voiceCtrl.conversationEndPending = false;
      clearPendingResume();
    }
    startVoiceRecording();
  };

  const startVoiceRecording = async () => {
    try {
      clearPendingResume();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = {};
      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
      ];
      const supportedType = preferredTypes.find((type) =>
        global.MediaRecorder?.isTypeSupported?.(type)
      );
      if (supportedType) {
        options.mimeType = supportedType;
      }
      const recorder = new MediaRecorder(stream, options);
      voiceCtrl.chunks = [];
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data?.size) {
          voiceCtrl.chunks.push(event.data);
        }
      });
      recorder.addEventListener('stop', () => handleRecordingStop(recorder));
      recorder.start();
      voiceCtrl.stream = stream;
      voiceCtrl.recorder = recorder;
      voiceCtrl.lastSpeechAt = Date.now();
      clearVadSilenceTimer();
      if (voiceCtrl.vadCtrl) {
        try {
          await voiceCtrl.vadCtrl.start(stream, handleVadStateChange);
        } catch (vadErr) {
          console.warn('[hub] vad start failed', vadErr);
        }
      }
      setVoiceState('listening');
    } catch (err) {
      console.error('[hub] Unable to access microphone', err);
      try {
        voiceCtrl?.vadCtrl?.stop();
      } catch (_) {
        /* no-op */
      }
      setVoiceState('error', 'Mikrofon blockiert?');
      setTimeout(() => setVoiceState('idle'), 2400);
    }
  };

  const stopVoiceRecording = () => {
    clearVadSilenceTimer();
    clearPendingResume();
    try {
      voiceCtrl?.vadCtrl?.stop();
    } catch (err) {
      console.warn('[hub] vad stop failed', err);
    }
    if (!voiceCtrl?.recorder) return;
    try {
      voiceCtrl.recorder.stop();
    } catch (err) {
      console.warn('[hub] recorder stop failed', err);
    }
    if (voiceCtrl.stream) {
      voiceCtrl.stream.getTracks().forEach((track) => track.stop());
    }
    voiceCtrl.stream = null;
    voiceCtrl.recorder = null;
    setVoiceState('thinking');
  };

  const handleRecordingStop = async (recorder) => {
    try {
      if (!voiceCtrl?.chunks?.length) {
        setVoiceState('idle');
        return;
      }
      const blob = new Blob(voiceCtrl.chunks, {
        type: recorder?.mimeType || 'audio/webm',
      });
      voiceCtrl.chunks = [];
      if (appModules.config?.DEV_ALLOW_DEFAULTS) {
        diag.add?.(
          `[midas-voice] Aufnahme abgeschlossen: ${blob.type}, ${(blob.size / 1024).toFixed(1)} KB`
        );
      }
      await processVoiceBlob(blob);
    } catch (err) {
      console.error('[hub] voice processing failed', err);
      setVoiceState('error', 'Verarbeitung fehlgeschlagen');
      setTimeout(() => setVoiceState('idle'), 2400);
    }
  };

  const processVoiceBlob = async (blob) => {
    try {
      setVoiceState('thinking');
      const transcript = await transcribeAudio(blob);
      if (!transcript) {
        setVoiceState('idle');
        return;
      }
      diag.add?.(`[midas-voice] Transcript: ${transcript}`);
      if (
        voiceCtrl?.conversationMode &&
        shouldEndConversationFromTranscript(transcript)
      ) {
        voiceCtrl.conversationEndPending = true;
      }
      await handleAssistantRoundtrip(transcript);
    } catch {
      setVoiceState('idle');
    }
  };

  const ensureVoiceHistory = () => {
    if (!voiceCtrl) return;
    if (!Array.isArray(voiceCtrl.history)) {
      voiceCtrl.history = [];
    }
    if (!voiceCtrl.sessionId) {
      voiceCtrl.sessionId = `voice-${Date.now()}`;
    }
  };

  const transcribeAudio = async (blob) => {
    const formData = new FormData();
    formData.append('audio', blob, 'midas-voice.webm');
    let response;
    try {
      const headers = await getSupabaseFunctionHeaders();
      if (DIRECT_SUPABASE_CALL && !headers) {
        console.warn('[hub] Supabase headers missing for direct call');
        setVoiceState('error', 'Konfiguration fehlt');
        setTimeout(() => setVoiceState('idle'), 2600);
        throw new Error('supabase-headers-missing');
      }
      response = await fetch(MIDAS_ENDPOINTS.transcribe, {
        method: 'POST',
        headers: headers ?? undefined,
        body: formData,
      });
    } catch (networkErr) {
      console.error('[hub] network error transcribing', networkErr);
      setVoiceState('error', 'Keine Verbindung');
      setTimeout(() => setVoiceState('idle'), 2600);
      throw networkErr;
    }
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('[hub] transcribe failed:', errText);
      setVoiceState('error', 'Transkription fehlgeschlagen');
      setTimeout(() => setVoiceState('idle'), 2600);
      throw new Error(errText || 'Transcription failed');
    }
    const payload = await response.json().catch(() => ({}));
    return (payload.text || payload.transcript || '').trim();
  };

  const getSupabaseFunctionHeaders = async () => {
    if (!DIRECT_SUPABASE_CALL) {
      return null;
    }
    if (supabaseFunctionHeadersPromise) {
      return supabaseFunctionHeadersPromise;
    }
    const loader = (async () => {
      if (typeof global.getConf !== 'function') {
        diag.add?.('[hub] getConf missing - cannot load Supabase key');
        return null;
      }
      try {
        const stored = await global.getConf('webhookKey');
        const raw = String(stored || '').trim();
        if (!raw) {
          diag.add?.('[hub] Supabase webhookKey missing - voice API locked');
          return null;
        }
        const bearer = raw.startsWith('Bearer ') ? raw : `Bearer ${raw}`;
        const apikey = bearer.replace(/^Bearer\s+/i, '');
        return {
          'Authorization': bearer,
          'apikey': apikey,
        };
      } catch (err) {
        console.error('[hub] Failed to load Supabase headers', err);
        return null;
      } finally {
        supabaseFunctionHeadersPromise = null;
      }
    })();
    supabaseFunctionHeadersPromise = loader;
    return loader;
  };
  const buildFunctionJsonHeaders = async () => {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (!DIRECT_SUPABASE_CALL) {
      return headers;
    }
    const authHeaders = await getSupabaseFunctionHeaders();
    if (!authHeaders) {
      diag.add?.('[hub] Supabase headers missing for assistant call');
      setVoiceState('error', 'Konfiguration fehlt');
      setTimeout(() => setVoiceState('idle'), 2600);
      throw new Error('supabase-headers-missing');
    }
    return { ...headers, ...authHeaders };
  };

  const handleAssistantRoundtrip = async (transcript) => {
    ensureVoiceHistory();
    if (!voiceCtrl) return;
    const userMessage = {
      role: 'user',
      content: transcript,
    };
    voiceCtrl.history.push(userMessage);
    try {
      const assistantResponse = await fetchAssistantReply();
      const replyText = assistantResponse.reply;
      if (replyText) {
        voiceCtrl.history.push({
          role: 'assistant',
          content: replyText,
        });
        diag.add?.(`[midas-voice] Assistant reply: ${replyText}`);
        if (assistantResponse.actions?.length) {
          if (appModules.config?.DEV_ALLOW_DEFAULTS) {
            diag.add?.(
              `[midas-voice] Assistant actions: ${assistantResponse.actions.join(', ')}`
            );
          }
          if (
            voiceCtrl.conversationMode &&
            assistantResponse.actions.some((action) => END_ACTIONS.includes(action))
          ) {
            voiceCtrl.conversationEndPending = true;
          }
        }
        await synthesizeAndPlay(replyText);
      } else {
        diag.add?.('[midas-voice] Assistant reply empty');
      }
      const allowResume = voiceCtrl.conversationMode && !voiceCtrl.conversationEndPending;
      setVoiceState('idle');
      if (allowResume) {
        scheduleConversationResume();
      } else {
        endConversationSession();
      }
    } catch (err) {
      voiceCtrl.history.pop();
      console.error('[midas-voice] assistant roundtrip failed', err);
      setVoiceState('error', 'Assistant nicht erreichbar');
      setTimeout(() => setVoiceState('idle'), 2600);
      endConversationSession();
      throw err;
    }
  };

  const fetchAssistantReply = async () => {
    if (!voiceCtrl) {
      return { reply: '', actions: [], meta: null };
    }
    const payload = {
      session_id: voiceCtrl.sessionId ?? `voice-${Date.now()}`,
      mode: 'voice',
      messages: voiceCtrl.history ?? [],
    };
    let response;
    try {
      const headers = await buildFunctionJsonHeaders();
      response = await fetch(MIDAS_ENDPOINTS.assistant, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
    } catch (networkErr) {
      console.error('[hub] assistant network error', networkErr);
      throw networkErr;
    }
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('[hub] assistant failed:', errText);
      throw new Error(errText || 'assistant failed');
    }
    const rawText = await response.text();
    let data = null;
    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch (err) {
        console.warn('[hub] assistant response not JSON, falling back to default', err);
      }
    }

    let reply = typeof data?.reply === 'string' ? data.reply.trim() : '';
    if (!reply) {
      if (rawText) {
        console.warn('[hub] assistant payload missing reply, snippet:', rawText.slice(0, 160));
      }
      diag.add?.('[midas-voice] Assistant reply empty, using fallback.');
      reply = VOICE_FALLBACK_REPLY;
    }
    const actions = Array.isArray(data?.actions) ? [...data.actions] : [];

    // Manche Antworten enthalten versehentlich ein JSON-Objekt als Text ({"reply":"...","actions":[]}).
    // In diesem Fall extrahieren wir den inneren reply-Text, damit TTS keinen JSON-Block vorliest.
    if (reply.startsWith('{')) {
      try {
        const nested = JSON.parse(reply);
        if (typeof nested?.reply === 'string' && nested.reply.trim()) {
          reply = nested.reply.trim();
        }
        // Wenn das verschachtelte Objekt Actions enth�lt, nutze sie nur, wenn oben nichts �bertragen wurde.
        if (!actions.length && Array.isArray(nested?.actions)) {
          actions.push(...nested.actions);
        }
      } catch (err) {
        console.warn('[hub] nested assistant reply not JSON-parsable', err);
      }
    }

    return {
      reply,
      actions,
      meta: data && typeof data === 'object' ? data.meta ?? null : null,
    };
  };

  const synthesizeAndPlay = async (text) => {
    if (!text) {
      setVoiceState('idle');
      return;
    }
    try {
      const audioUrl = await requestTtsAudio(text);
      if (!audioUrl) {
        setVoiceState('idle');
        return;
      }
      await playVoiceAudio(audioUrl);
    } catch (err) {
      console.error('[midas-voice] tts failed', err);
      setVoiceState('error', 'TTS fehlgeschlagen');
      setTimeout(() => setVoiceState('idle'), 2600);
    }
  };

  const requestTtsAudio = async (text) => {
    const headers = await buildFunctionJsonHeaders();
    let response;
    try {
      response = await fetch(MIDAS_ENDPOINTS.tts, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text }),
      });
    } catch (networkErr) {
      console.error('[hub] tts network error', networkErr);
      throw networkErr;
    }
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(errText || 'tts failed');
    }
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      const payload = await response.json();
      if (payload?.audio_base64) {
        const blob = base64ToBlob(payload.audio_base64, payload.mime_type || 'audio/mpeg');
        return URL.createObjectURL(blob);
      }
      if (payload?.audio_url) {
        return payload.audio_url;
      }
      return null;
    }
    const buffer = await response.arrayBuffer();
    const blob = new Blob([buffer], { type: contentType || 'audio/mpeg' });
    return URL.createObjectURL(blob);
  };

  const playVoiceAudio = (audioUrl) =>
    new Promise((resolve, reject) => {
      if (!voiceCtrl) {
        resolve();
        return;
      }
      const audioEl = ensureVoiceAudioElement();
      stopVoicePlayback();
      setVoiceState('speaking');
      voiceCtrl.currentAudioUrl = audioUrl;
      audioEl.src = audioUrl;
      startVoiceMeter();
      const cleanup = () => {
        if (voiceCtrl?.currentAudioUrl) {
          URL.revokeObjectURL(voiceCtrl.currentAudioUrl);
          voiceCtrl.currentAudioUrl = null;
        }
        audioEl.onended = null;
        audioEl.onerror = null;
        stopVoiceMeter();
      };
      audioEl.onended = () => {
        cleanup();
        setVoiceState('idle');
        resolve();
      };
      audioEl.onerror = (event) => {
        cleanup();
        setVoiceState('idle');
        reject(event?.error || new Error('audio playback failed'));
      };
      audioEl
        .play()
        .catch((err) => {
          cleanup();
          setVoiceState('idle');
          reject(err);
        });
    });

  const ensureVoiceAudioElement = () => {
    if (!voiceCtrl) return null;
    if (!voiceCtrl.audioEl) {
      voiceCtrl.audioEl = new Audio();
      voiceCtrl.audioEl.preload = 'auto';
      if (voiceCtrl.orbitEl && !voiceCtrl.orbitEl.style.getPropertyValue('--voice-amp')) {
        voiceCtrl.orbitEl.style.setProperty('--voice-amp', '0');
      }
    }
    return voiceCtrl.audioEl;
  };

  const stopVoicePlayback = () => {
    if (!voiceCtrl?.audioEl) return;
    try {
      voiceCtrl.audioEl.pause();
      voiceCtrl.audioEl.currentTime = 0;
    } catch (err) {
      console.warn('[hub] audio pause failed', err);
    }
    stopVoiceMeter();
    if (voiceCtrl?.currentAudioUrl) {
      URL.revokeObjectURL(voiceCtrl.currentAudioUrl);
      voiceCtrl.currentAudioUrl = null;
    }
  };

  const base64ToBlob = (base64, mimeType = 'application/octet-stream') => {
    const byteChars = global.atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i += 1) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  };

  const bootFlow = global.AppModules?.bootFlow;
  if (bootFlow?.whenStage) {
    bootFlow.whenStage('INIT_UI', () => activateHubLayout());
  } else if (doc?.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', activateHubLayout, { once: true });
  } else {
    activateHubLayout();
  }

  appModules.hub = Object.assign(appModules.hub || {}, {
    activateHubLayout,
    openDoctorPanel: (options) => {
      if (openDoctorPanelWithGuard) {
        return openDoctorPanelWithGuard(options);
      }
      return Promise.resolve(false);
    },
    closePanel: (panelName) => {
      if (panelName && activePanel?.dataset?.hubPanel !== panelName) {
        return false;
      }
      closeActivePanel({ instant: true });
      return true;
    },
    forceClosePanel: (panelName, opts) => forceClosePanelByName(panelName, opts),
  });
})(typeof window !== 'undefined' ? window : globalThis);
