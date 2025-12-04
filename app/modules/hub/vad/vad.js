(function initMidasVAD(global) {
  const AudioCtx = global.AudioContext || global.webkitAudioContext;
  const diag =
    global.diag ||
    global.AppModules?.diag ||
    global.AppModules?.diagnostics || { add() {} };
  const defaults = {
    threshold: 0.015,
    minSpeechFrames: 3,
    minSilenceFrames: 8,
    reportInterval: 4,
  };
  const WORKLET_URL = 'app/modules/hub/vad/vad-worklet.js';

  function createController(userOptions = {}) {
    if (!AudioCtx) {
      console.warn('[vad] AudioContext not supported');
      return null;
    }

    const options = { ...defaults, ...userOptions };
    let audioCtx = null;
    let mediaSource = null;
    let workletNode = null;
    let fallbackNode = null;
    let silentGain = null;
    let stateCallback = () => {};
    let speechFrames = 0;
    let silenceFrames = options.minSilenceFrames;
    let currentState = 'silence';
    let workletReady = false;
    let gateUnsub = null;

    const ensureAudioCtx = () => {
      if (!audioCtx) {
        audioCtx = new AudioCtx();
      }
      return audioCtx;
    };

    const getHubVoiceApi = () => global.AppModules?.hub || null;
    const checkVoiceGate = () => {
      const api = getHubVoiceApi();
      const status = api?.getVoiceGateStatus?.();
      if (!status) return { allowed: true, reason: '' };
      return status;
    };

    const subscribeToGate = () => {
      const api = getHubVoiceApi();
      if (typeof api?.onVoiceGateChange !== 'function') return null;
      return api.onVoiceGateChange((status) => {
        if (!status?.allowed) {
          diag.add?.('[vad] stop due to voice gate lock');
          stop();
        }
      });
    };

    const cleanupGateSub = () => {
      if (typeof gateUnsub === 'function') {
        try {
          gateUnsub();
        } catch (_) {
          /* ignore */
        }
        gateUnsub = null;
      }
    };

    const ensureWorklet = async () => {
      const ctx = ensureAudioCtx();
      if (!ctx.audioWorklet) {
        return false;
      }
      if (!workletReady) {
        try {
          await ctx.audioWorklet.addModule(WORKLET_URL);
          workletReady = true;
        } catch (err) {
          console.warn('[vad] failed to load worklet, falling back', err);
        }
      }
      return workletReady;
    };

    const resetCounters = () => {
      speechFrames = 0;
      silenceFrames = options.minSilenceFrames;
      currentState = 'silence';
    };

    const handleFrame = (isSpeech) => {
      if (isSpeech) {
        speechFrames += 1;
        silenceFrames = 0;
        if (
          speechFrames >= options.minSpeechFrames &&
          currentState !== 'speech'
        ) {
          currentState = 'speech';
          stateCallback('speech');
        }
      } else {
        silenceFrames += 1;
        speechFrames = 0;
        if (
          silenceFrames >= options.minSilenceFrames &&
          currentState !== 'silence'
        ) {
          currentState = 'silence';
          stateCallback('silence');
        }
      }
    };

    const setupFallback = (ctx) => {
      fallbackNode = ctx.createScriptProcessor(1024, 1, 1);
      fallbackNode.onaudioprocess = (event) => {
        const channel = event.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < channel.length; i += 1) {
          const sample = channel[i];
          sum += sample * sample;
        }
        const rms = Math.sqrt(sum / channel.length) || 0;
        handleFrame(rms > options.threshold);
      };
      silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      fallbackNode.connect(silentGain);
      silentGain.connect(ctx.destination);
    };

    const start = async (stream, onStateChange) => {
      if (!stream) return;
      const gateStatus = checkVoiceGate();
      if (!gateStatus.allowed) {
        diag.add?.('[vad] start blocked: ' + (gateStatus.reason || 'voice-locked'));
        const err = new Error('voice-not-ready');
        err.code = 'voice-not-ready';
        throw err;
      }
      stateCallback = typeof onStateChange === 'function'
        ? onStateChange
        : () => {};

      resetCounters();
      const ctx = ensureAudioCtx();
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch (err) {
          console.warn('[vad] resume failed', err);
        }
      }
      mediaSource = ctx.createMediaStreamSource(stream);
      cleanupGateSub();
      gateUnsub = subscribeToGate();

      const canUseWorklet = await ensureWorklet();
      if (canUseWorklet) {
        workletNode = new AudioWorkletNode(ctx, 'hub-vad-processor', {
          numberOfInputs: 1,
          numberOfOutputs: 0,
        });
        workletNode.port.onmessage = (event) => {
          if (event?.data?.type === 'vad-data') {
            handleFrame(Boolean(event.data.isSpeech));
          }
        };
        workletNode.port.postMessage({
          type: 'config',
          threshold: options.threshold,
          reportInterval: options.reportInterval,
        });
        mediaSource.connect(workletNode);
      } else {
        setupFallback(ctx);
        mediaSource.connect(fallbackNode);
      }
    };

    const stop = () => {
      cleanupGateSub();
      if (workletNode) {
        workletNode.port.onmessage = null;
        workletNode.disconnect();
      }
      if (fallbackNode) {
        fallbackNode.disconnect();
        fallbackNode.onaudioprocess = null;
      }
      if (silentGain) {
        silentGain.disconnect();
      }
      if (mediaSource) {
        mediaSource.disconnect();
      }
      workletNode = null;
      fallbackNode = null;
      silentGain = null;
      mediaSource = null;
    };

    return {
      start,
      stop,
    };
  }

  global.MidasVAD = {
    createController: createController,
  };
})(typeof window !== 'undefined' ? window : globalThis);
