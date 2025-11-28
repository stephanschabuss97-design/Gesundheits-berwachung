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

  let hubButtons = [];
  let activePanel = null;
  let setSpriteStateFn = null;
  let doctorUnlockWaitCancel = null;
  let voiceCtrl = null;
  let assistantChatCtrl = null;
  let supabaseFunctionHeadersPromise = null;

  const getSupabaseApi = () => appModules.supabase || {};

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
    const unlockFn = supa?.requireDoctorUnlock;
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
    bindButton('[data-hub-module="assistant-text"]', openPanelHandler('assistant-text'), { sync: false });
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
    bindButton('[data-hub-module="assistant-voice"]', () => {
      handleVoiceTrigger();
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

  let assistantChatSetupAttempts = 0;
  const ASSISTANT_CHAT_MAX_ATTEMPTS = 10;
  const ASSISTANT_CHAT_RETRY_DELAY = 250;

  const setupAssistantChat = (hub) => {
    console.info('[assistant-chat] setupAssistantChat called');
    if (assistantChatCtrl) {
      console.info('[assistant-chat] controller already initialised');
      return;
    }
    const panel = doc?.getElementById('hubAssistantPanel');
    if (!panel) {
      assistantChatSetupAttempts += 1;
      console.warn('[assistant-chat] panel missing', {
        attempt: assistantChatSetupAttempts,
      });
      if (assistantChatSetupAttempts < ASSISTANT_CHAT_MAX_ATTEMPTS) {
        global.setTimeout(() => setupAssistantChat(hub), ASSISTANT_CHAT_RETRY_DELAY);
      } else {
        console.error('[assistant-chat] panel missing after retries');
      }
      return;
    }
    assistantChatSetupAttempts = 0;
    console.info('[assistant-chat] panel found');
    const chatEl = panel.querySelector('#assistantChat');
    const form = panel.querySelector('#assistantChatForm');
    const input = panel.querySelector('#assistantMessage');
    const sendBtn = panel.querySelector('#assistantSendBtn');
    const cameraBtn = panel.querySelector('#assistantCameraBtn');
    const dictateBtn = panel.querySelector('#assistantDictateBtn');
    const clearBtn = panel.querySelector('#assistantClearChat');

    const photoInput = doc.createElement('input');
    photoInput.type = 'file';
    photoInput.accept = 'image/*';
    photoInput.capture = 'environment';
    photoInput.hidden = true;
    panel.appendChild(photoInput);

    assistantChatCtrl = {
      panel,
      chatEl,
      form,
      input,
      sendBtn,
      cameraBtn,
      dictateBtn,
      clearBtn,
      photoInput,
      messages: [],
      sessionId: null,
      sending: false,
    };

    console.info('[assistant-chat] ctrl ready', {
      hasForm: !!form,
      hasInput: !!input,
      hasSendBtn: !!sendBtn,
    });

    form?.addEventListener(
      'submit',
      (event) => {
        console.info('[assistant-chat] form submit event', {
          defaultPrevented: event.defaultPrevented,
          type: event.type,
        });
      },
      true,
    );
    sendBtn?.addEventListener('click', () => {
      console.info('[assistant-chat] send button click');
    });

    form?.addEventListener('submit', handleAssistantChatSubmit);
    clearBtn?.addEventListener('click', () => resetAssistantChat(true));
    photoInput.addEventListener('change', handleAssistantPhotoSelected, false);
    cameraBtn?.addEventListener('click', handleAssistantCameraClick);
    dictateBtn?.addEventListener('click', handleAssistantDictateStub);
    resetAssistantChat();
    console.info('[assistant-chat] setup complete');
  };

  const handleAssistantCameraClick = () => {
    if (!assistantChatCtrl?.photoInput) {
      appendAssistantMessage('system', 'Kamera nicht verfügbar.');
      return;
    }
    assistantChatCtrl.photoInput.value = '';
    assistantChatCtrl.photoInput.click();
  };

  const handleAssistantPhotoSelected = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;
    if (file.size > MAX_ASSISTANT_PHOTO_BYTES) {
      appendAssistantMessage('system', 'Das Foto ist zu groß (max. ca. 6 MB).');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await sendAssistantPhotoMessage(dataUrl, file);
    } catch (err) {
      console.error('[assistant-chat] foto konnte nicht gelesen werden', err);
      appendAssistantMessage('system', 'Das Foto konnte nicht gelesen werden.');
    }
  };

  const handleAssistantDictateStub = () => {
    console.info('[assistant-chat] dictate placeholder');
    diag?.add?.('[assistant-chat] Diktat', 'Noch nicht implementiert');
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
      console.info('[assistant-chat] new session', assistantChatCtrl.sessionId);
    }
  };

  const handleAssistantChatSubmit = (event) => {
    event.preventDefault();
    if (!assistantChatCtrl) return;
    const value = assistantChatCtrl.input?.value?.trim();
    if (!value) return;
    console.info('[assistant-chat] submit', { value });
    sendAssistantChatMessage(value);
  };

  const sendAssistantChatMessage = async (text) => {
    if (!assistantChatCtrl || assistantChatCtrl.sending) return;
    console.info('[assistant-chat] send start', { text });
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
      console.info('[assistant-chat] send end');
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
    };
    assistantChatCtrl.messages.push(message);
    renderAssistantChat();
    return message;
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
      const bubble = doc.createElement('div');
      bubble.className = `assistant-bubble assistant-${message.role}`;
      bubble.setAttribute('data-role', message.role);
      if (message.imageData) {
        bubble.classList.add('assistant-has-image');
        const figure = doc.createElement('div');
        figure.className = 'assistant-photo';
        const img = doc.createElement('img');
        img.src = message.imageData;
        img.alt =
          message.meta?.fileName
            ? `Foto ${message.meta.fileName}`
            : 'Hochgeladenes Foto';
        figure.appendChild(img);
        bubble.appendChild(figure);
      }
      if (message.content) {
        const text = doc.createElement('p');
        text.className = 'assistant-text-line';
        text.textContent = message.content;
        bubble.appendChild(text);
      }
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
      assistantChatCtrl.dictateBtn?.setAttribute('disabled', 'disabled');
    } else {
      assistantChatCtrl.sendBtn?.removeAttribute('disabled');
      assistantChatCtrl.input?.removeAttribute('disabled');
      assistantChatCtrl.cameraBtn?.removeAttribute('disabled');
      assistantChatCtrl.dictateBtn?.removeAttribute('disabled');
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
    console.log('[assistant-chat] headers', headers, payload);
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

  const sendAssistantPhotoMessage = async (dataUrl, file) => {
    if (!assistantChatCtrl || assistantChatCtrl.sending) return;
    ensureAssistantSession();
    const previewMessage = appendAssistantMessage('user', 'Foto wird analysiert …', {
      imageData: dataUrl,
      meta: { fileName: file?.name || '' },
    });
    setAssistantSending(true);
    try {
      const reply = await fetchAssistantVisionReply(dataUrl, file);
      if (previewMessage) {
        previewMessage.content = 'Foto gesendet.';
      }
      appendAssistantMessage('assistant', reply);
    } catch (err) {
      console.error('[assistant-chat] vision request failed', err);
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
    return reply;
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
      reader.onload = () => resolve(reader.result);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });

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
        console.info('[midas-voice] Auto-stop nach Stille');
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
      console.info('[hub] voice is busy processing');
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
      console.info(
        '[midas-voice] Aufnahme abgeschlossen:',
        blob.type,
        `${(blob.size / 1024).toFixed(1)} KB`,
      );
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
      console.info('[midas-voice] Transcript:', transcript);
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
        console.warn('[hub] getConf missing - cannot load Supabase key');
        return null;
      }
      try {
        console.info('[assistant-chat] loading webhookKey via getConf');
        const stored = await global.getConf('webhookKey');
        const raw = String(stored || '').trim();
        console.info('[assistant-chat] webhookKey present?', !!raw);
        if (!raw) {
          console.warn('[hub] Supabase webhookKey missing - voice API locked');
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
      console.warn('[hub] Supabase headers missing for assistant call');
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
        console.info('[midas-voice] Assistant reply:', replyText);
        if (assistantResponse.actions?.length) {
          console.info('[midas-voice] Assistant actions:', assistantResponse.actions);
          if (
            voiceCtrl.conversationMode &&
            assistantResponse.actions.some((action) => END_ACTIONS.includes(action))
          ) {
            voiceCtrl.conversationEndPending = true;
          }
        }
        await synthesizeAndPlay(replyText);
      } else {
        console.info('[midas-voice] Assistant reply empty');
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
      console.info('[midas-voice] Assistant reply empty, using fallback.');
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

  if (doc?.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', activateHubLayout, { once: true });
  } else {
    activateHubLayout();
  }

  appModules.hub = Object.assign(appModules.hub || {}, { activateHubLayout });
})(typeof window !== 'undefined' ? window : globalThis);
