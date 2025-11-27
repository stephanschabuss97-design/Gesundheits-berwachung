class HubVADProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.threshold = 0.015;
    this.reportInterval = 4;
    this.frameCounter = 0;

    this.port.onmessage = (event) => {
      const data = event?.data || {};
      if (data.type === 'config') {
        if (typeof data.threshold === 'number') {
          this.threshold = data.threshold;
        }
        if (typeof data.reportInterval === 'number') {
          this.reportInterval = Math.max(1, data.reportInterval | 0);
        }
      }
    };
  }

  process(inputs) {
    const input = inputs?.[0];
    if (!input || !input[0]) {
      return true;
    }

    const channelData = input[0];
    let sum = 0;
    for (let i = 0; i < channelData.length; i += 1) {
      const sample = channelData[i];
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / channelData.length) || 0;

    this.frameCounter += 1;
    if (this.frameCounter >= this.reportInterval) {
      this.port.postMessage({
        type: 'vad-data',
        rms,
        isSpeech: rms > this.threshold,
      });
      this.frameCounter = 0;
    }

    return true;
  }
}

registerProcessor('hub-vad-processor', HubVADProcessor);
