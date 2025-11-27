# Assistant Module – Functional Overview (Voice Loop)

Dieses Dokument beschreibt den aktuellen Stand des MIDAS-Assistant-Moduls (Voice-Beta). Aufbau und Tiefe orientieren sich am Auth-Overview und decken sowohl Frontend- als auch Backend-Flüsse ab.

---

## 1. Zielsetzung

- Vollständiger Voice-Kreislauf: Aufnahme ? Transcribe ? Assistant ? TTS ? Playback.
- Persona „MIDAS“: freundlich, kurz, ehrlich – keine Werte ohne Kontext, keine Diagnosen.
- Grundlage für kommende Text-UI, Allowed Actions (Intake, Termine) und Doctor-Routing.

---

## 2. Kernkomponenten & Dateien

| Ebene | Datei | Zweck |
| --- | --- | --- |
| Frontend | `app/modules/hub/index.js` | Voice-Controller: Recording, Fetches, State-Machine (`idle/listening/thinking/speaking/error`), Playback. |
| Frontend | `index.html` | CSP erweitert (`media-src 'self' blob:`) für Audio aus Edge Functions. |
| Frontend | `docs/Voice Assistant roadmap.md` | Roadmap/QA (Phase 0–7, Tests je Schritt). |
| Backend | `supabase/functions/midas-transcribe/index.ts` | Whisper (`gpt-4o-transcribe`), FormData Upload. |
| Backend | `supabase/functions/midas-assistant/index.ts` | OpenAI Responses API (`gpt-4.1-mini`), Persona, `{ reply, actions, meta }`. |
| Backend | `supabase/functions/midas-tts/index.ts` | `gpt-4o-mini-tts`, default Voice `verse`, Base64 oder Direktstream. |

Deployment über `supabase functions deploy <name> --project-ref jlylmservssinsavlkdi`. Secrets (z.?B. `OPENAI_API_KEY`) im Edge-Function-Secret-Store hinterlegen.

---

## 3. Voice-Loop (Frontend)

1. **Start/Stop Input** – `startVoiceRecording()` initiiert `MediaRecorder`, `handleVoiceTrigger()` toggelt Aufnahme / Playback / Busy.
2. **Transcribe** – `transcribeAudio()` baut FormData (`audio`) und ruft `/midas-transcribe`; UI-State ? `thinking`.
3. **Assistant Roundtrip** – `fetchAssistantReply()` sendet History (`voiceCtrl.history`) inkl. `session_id`, erhält Reply + Actions.
4. **TTS Playback** – `requestTtsAudio()` ? Blob-URL, `playVoiceAudio()` setzt `speaking`, Cleanup nach `onended`.
5. **State Labels & Fallback** – `VOICE_STATE_LABELS` + `VOICE_FALLBACK_REPLY` halten UX stabil (z.?B. bei Netzwerkfehlern).

---

## 4. Backend-Flows & Konfiguration

- **midas-transcribe (`index.ts`)**
  - Erlaubt `OPTIONS` für CORS.
  - Erwartet `audio`-Datei, ruft Whisper `gpt-4o-transcribe`, liefert `{ text }`.
  - Errors: `Whisper failed` (502) mit Details.

- **midas-assistant (`index.ts`)**
  - Nutzt `buildChatMessages()` (Systemprompt + Voice-Mode-Hinweis + History).
  - Responses API (`input`, `max_output_tokens`) ? `extractReplyFromCompletion()`.
  - Liefert `{ reply, actions: [], meta }`; fallback bei leeren Antworten.
  - Logging deckt OpenAI-Fehler und JSON-Parsing ab.

- **midas-tts (`index.ts`)**
  - Erwartet `{ text }`, ruft `gpt-4o-mini-tts` (Stimme `verse`).
  - Antwort als Base64 + MIME-Type oder Roh-Audio; Frontend erstellt Blob-URL.
  - Fehler führen zu JSON `{ error: "TTS request failed" }`.

- **Supabase Headers**
  - GitHub Pages nutzen direkte Supabase-URLs ? `getConf('webhookKey')` liefert `Authorization`/`apikey`.
  - Lokale Entwicklung bedient `/api/midas-*` Proxy (kein zusätzlicher Header nötig).

---

## 5. Diagnose, Logging & Tests

- Browser-Konsole: `[midas-voice] Transcript`, `[midas-voice] Assistant reply`, `[midas-voice] tts failed`.
- Supabase CLI: `supabase functions logs midas-assistant --project-ref jlylmservssinsavlkdi`.
- Roadmap Testing: `docs/Voice Assistant roadmap.md` beschreibt erwartete Logs pro Phase (Blob-Größe, Transcript, Assistant-Reply, Audio-Playback).
- QA-Notizen: History-Reset, Session-ID, Supabase-Header-Verfügbarkeit (`Konfiguration fehlt`) dokumentieren.

---

## 6. Sicherheits- & Edge-Aspekte

- Keine Secrets im Frontend; API-Key ausschließlich in Edge Functions.
- Fallback Reply verhindert stille Fehler; UI springt nach Zeitüberschreitung auf `idle`.
- CSP beschränkt Audio auf `self` + `blob:` ? externe Medien blockiert.
- Logging enttarnt fehlende Supabase-Konfiguration oder Quoten-Probleme (`insufficient_quota`).

---

## 7. Aktueller Status & Roadmap

- ? Phase 1.1–1.4: Audio Capture, Transcribe, Assistant, TTS.
- ?? Phase 1.5/1.6: Glow-Ring Animation, Voice-Greeting (Needle).
- ?? Phase 3: Assistant Text-UI inkl. Foto-Upload & Diktiermodus.
- ?? Phase 4: Allowed Actions (`IntakeSave`, `DoctorRouting`) und Terminmodul.
- ?? Phase 0: Boot-Logger, Bootstrap-Validator.
- ? Zukunft: Streaming-TTS, Wakeword, Offline-Modus, Health-Briefings.

Updates erfolgen nach Abschluss weiterer Phasen (Text-UI, Actions, Terminplanung).
