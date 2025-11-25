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
  const MIDAS_ENDPOINTS = {
    assistant: '/api/midas-assistant',
    transcribe: '/api/midas-transcribe',
    tts: '/api/midas-tts',
  };

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

  let hubButtons = [];
  let activePanel = null;
  let setSpriteStateFn = null;
  let doctorUnlockWaitCancel = null;
  let voiceCtrl = null;

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
      audioEl: null,
      history: [],
      sessionId: (global.crypto?.randomUUID?.() ?? `voice-${Date.now()}`),
      currentAudioUrl: null,
    };
    setVoiceState('idle');
  };

  const setVoiceState = (state, customLabel) => {
    if (!voiceCtrl?.button) return;
    voiceCtrl.status = state;
    const label = customLabel ?? VOICE_STATE_LABELS[state] ?? '';
    voiceCtrl.button.dataset.voiceState = state;
    voiceCtrl.button.dataset.voiceLabel = label;
    voiceCtrl.button.setAttribute('aria-pressed', state === 'listening');
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
      console.info('[hub] voice assistant is already processing');
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
      await processVoiceBlob(blob);
    } catch (err) {
      console.error('[hub] voice processing failed', err);
      setVoiceState('error', 'Verarbeitung fehlgeschlagen');
      setTimeout(() => setVoiceState('idle'), 2400);
    }
  };

  const processVoiceBlob = async (blob) => {
    const transcript = await transcribeAudio(blob);
    if (!transcript) {
      setVoiceState('idle');
      return;
    }
    voiceCtrl.history.push({ role: 'user', content: transcript });
    const reply = await fetchAssistantReply();
    if (!reply) {
      setVoiceState('idle');
      return;
    }
    voiceCtrl.history.push({ role: 'assistant', content: reply });
    const audioUrl = await requestTtsAudio(reply);
    if (!audioUrl) {
      setVoiceState('idle');
      return;
    }
    await playVoiceAudio(audioUrl);
    setVoiceState('idle');
  };

  const transcribeAudio = async (blob) => {
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'midas-voice.webm');
      const res = await fetch(MIDAS_ENDPOINTS.transcribe, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Transcribe error: ${errText}`);
      }
      const data = await res.json();
      const text = data?.text || data?.transcript || '';
      return text.trim();
    } catch (err) {
      console.error('[hub] transcription failed', err);
      setVoiceState('error', 'Transkription fehlgeschlagen');
      setTimeout(() => setVoiceState('idle'), 2600);
      throw err;
    }
  };

  const fetchAssistantReply = async () => {
    try {
      const payload = {
        session_id: voiceCtrl?.sessionId ?? `voice-${Date.now()}`,
        mode: 'voice',
        messages: voiceCtrl?.history ?? [],
      };
      const res = await fetch(MIDAS_ENDPOINTS.assistant, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'assistant error');
      }
      return (data?.reply || '').trim();
    } catch (err) {
      console.error('[hub] assistant reply failed', err);
      setVoiceState('error', 'Assistant nicht erreichbar');
      setTimeout(() => setVoiceState('idle'), 2600);
      throw err;
    }
  };

  const requestTtsAudio = async (text) => {
    if (!text) return null;
    try {
      const res = await fetch(MIDAS_ENDPOINTS.tts, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`TTS error: ${errText}`);
      }
      const contentType = res.headers.get('Content-Type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data?.audio_base64) {
          const blob = base64ToBlob(data.audio_base64, data.mime_type || 'audio/mpeg');
          return URL.createObjectURL(blob);
        }
        if (data?.audio_url) {
          return data.audio_url;
        }
        return null;
      }
      const buffer = await res.arrayBuffer();
      const blob = new Blob([buffer], { type: contentType || 'audio/mpeg' });
      return URL.createObjectURL(blob);
    } catch (err) {
      console.error('[hub] tts request failed', err);
      setVoiceState('error', 'TTS fehlgeschlagen');
      setTimeout(() => setVoiceState('idle'), 2600);
      throw err;
    }
  };

  const playVoiceAudio = (audioUrl) =>
    new Promise((resolve, reject) => {
      if (!audioUrl) {
        resolve();
        return;
      }
      setVoiceState('speaking');
      const audioEl = ensureVoiceAudioElement();
      stopVoicePlayback();
      voiceCtrl.currentAudioUrl = audioUrl;
      audioEl.src = audioUrl;
      const cleanup = () => {
        if (voiceCtrl?.currentAudioUrl) {
          URL.revokeObjectURL(voiceCtrl.currentAudioUrl);
          voiceCtrl.currentAudioUrl = null;
        }
        audioEl.onended = null;
        audioEl.onerror = null;
      };
      audioEl.onended = () => {
        cleanup();
        resolve();
      };
      audioEl.onerror = (event) => {
        cleanup();
        reject(event?.error || new Error('Audio playback failed'));
      };
      audioEl
        .play()
        .catch((err) => {
          cleanup();
          reject(err);
        });
    });

  const ensureVoiceAudioElement = () => {
    if (!voiceCtrl.audioEl) {
      voiceCtrl.audioEl = new Audio();
      voiceCtrl.audioEl.preload = 'auto';
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
