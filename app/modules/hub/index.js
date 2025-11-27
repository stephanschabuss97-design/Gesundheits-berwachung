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
      };
    }
    return {
      assistant: '/api/midas-assistant',
      transcribe: '/api/midas-transcribe',
      tts: '/api/midas-tts',
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

  let hubButtons = [];
  let activePanel = null;
  let setSpriteStateFn = null;
  let doctorUnlockWaitCancel = null;
  let voiceCtrl = null;
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

  const handleVoiceTrigger = () => {
    if (!voiceCtrl) {
      console.warn('[hub] voice controller missing');
      return;
    }
    if (voiceCtrl.status === 'listening') {
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
    startVoiceRecording();
  };

  const startVoiceRecording = async () => {
    try {
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
      setVoiceState('listening');
    } catch (err) {
      console.error('[hub] Unable to access microphone', err);
      setVoiceState('error', 'Mikrofon blockiert?');
      setTimeout(() => setVoiceState('idle'), 2400);
    }
  };

  const stopVoiceRecording = () => {
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
        console.warn('[hub] getConf missing – cannot load Supabase key');
        return null;
      }
      try {
        const stored = await global.getConf('webhookKey');
        const raw = String(stored || '').trim();
        if (!raw) {
          console.warn('[hub] Supabase webhookKey missing – voice API locked');
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
        }
        await synthesizeAndPlay(replyText);
      } else {
        console.info('[midas-voice] Assistant reply empty');
      }
      setVoiceState('idle');
    } catch (err) {
      voiceCtrl.history.pop();
      console.error('[midas-voice] assistant roundtrip failed', err);
      setVoiceState('error', 'Assistant nicht erreichbar');
      setTimeout(() => setVoiceState('idle'), 2600);
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
        // Wenn das verschachtelte Objekt Actions enthält, nutze sie nur, wenn oben nichts übertragen wurde.
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
