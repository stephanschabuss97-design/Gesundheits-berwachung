# VAD Module – Functional Overview

Dieses Dokument beschreibt das geplante Voice Activity Detection (VAD) Modul für MIDAS. Es basiert auf einem WebRTC-VAD (WASM-Port) und dient ausschließlich dazu, Sprach- vs. Stille-Phasen im Browser zu erkennen, um nach ca. 1 Sekunde Stille die Aufnahme automatisch zu stoppen.

---

## Zielsetzung

- Parallel zum MediaRecorder einen Low-Latency-VAD betreiben.
- 1 s Stille → `stopVoiceRecording()` triggern (Auto-Cancel).
- Browser-PWA-freundlich (Chrome/Edge Desktop & Android) ohne externe Services.

---

## Modulstruktur

```
app/modules/hub/
  index.js            # Voice Controller (bestehend)
  vad/
    vad.js            # Loader + API für WebRTC-VAD
    vad-worklet.js    # AudioWorkletProcessor (fallback ScriptProcessor)
    webrtc-vad.wasm   # WASM-Binary (per bundler eingebunden)
```

- `vad.js` exportiert Funktionen wie `initVAD()`, `startVAD(audioCtx, mediaStream, onState)`, `stopVAD()`.
- `vad-worklet.js` verarbeitet PCM-Frames (10/20 ms) und ruft den WASM-VAD. Alternativ kann ein ScriptProcessor-Fallback implementiert werden.
- Das WASM wird einmalig geladen und gecacht.

---

## Integration in `hub/index.js`

- **Start Recording** (`startVoiceRecording`):
  - Initialisiert `AudioContext`, `MediaStreamAudioSourceNode`, `VAD.start`.
  - Registriert Callback `handleVADStateChange(state)`.
- **Stop Recording**:
  - Stoppt `VAD.stop`, Worklet, AudioContext (falls nötig).
- **Neue States:**
  - `voiceCtrl.vad` – Referenz auf Controller.
  - `voiceCtrl.vadSilenceTimer` – Timeout-ID, um 1 s Stille zu messen.
  - `voiceCtrl.lastSpeechTs` – Timestamp letzter Speech-Frame.
- **Neue Helpers:**
  - `handleVADStateChange(state)` – resets/starts Silence Timer.
  - `forceStopRecording(reason)` – ruft `stopVoiceRecording` + Logging.

---

## Audio-Pipeline

1. `navigator.mediaDevices.getUserMedia` → `MediaStream`.
2. **MediaRecorder** (bestehend) sammelt Audiodaten für Supabase.
3. **AudioContext**:
   - `MediaStreamAudioSourceNode` → `AudioWorkletNode (vad-worklet)` → Worker ruft WebRTC-VAD.
   - Worklet sendet Speech/Silence Events zurück (via `port.postMessage`).
4. `vad.js` koordiniert Worklet + WASM.

---

## Datenstrukturen & Parameter

- PCM-Frames (Float32Arrays, 10 ms @ 16 kHz).
- `VAD_THRESHOLD` (z. B. 0/1-Entscheidung).
- `SILENCE_TIMEOUT_MS` (1000 ms).
- `speechFrames`, `silenceFrames` Counter zur Glättung.
- `voiceCtrl.vadState` (`'speech' | 'silence'`).
- Logging via `[midas-voice] vad state: ...`.

---

## Browser-Beschränkungen

- AudioWorklet benötigt HTTPS + COOP/COEP; falls nicht verfügbar → ScriptProcessor fallback.
- Android Chrome: AudioContext muss nach User-Geste gestartet werden (bei dir gegeben).
- PWA: WASM und Worklet müssen im Cache liegen (Deployment beachten).

---

## Ablauf Auto-Stop

1. Speech erkannt → Timer reset, UI bleibt `listening`.
2. Silence erkannt → Timer startet (1000 ms).
3. Falls Timer abläuft → `stopVoiceRecording()` + UI-Update (`thinking → idle`), Log `[vad] auto-stop`.
4. Sobald Speech wieder kommt, Timer wird abgebrochen.

---

## ToDo vor Implementierung

- WASM-Port auswählen (z. B. `webrtcvad-wasm`).
- Build/Bundle prüfen (WASM/Worklet).
- Edge Cases definieren (z. B. sehr kurze Antworten, Overflow).

