# Assistant Module – Functional Overview

This overview captures the current scope of the MIDAS Assistant (voice + text). It mirrors the structure of the Auth Overview and explains frontend/back‑end responsibilities as well as QA expectations.

---

## 1. Goal

- End-to-end assistant workflow: Capture → Transcribe → Assistant → (optional) TTS/Playback.
- Persona “MIDAS”: short, friendly, factual – no blind guesses, no diagnoses.
- Foundation for the new Assistant panel (text-first) plus the legacy voice loop.

---

## 2. Core Components

| Layer | File | Purpose |
| --- | --- | --- |
| Frontend | `app/modules/hub/index.js` | Voice controller, chat orchestration, state machine (`idle/listening/thinking/speaking/error`), playback handling, assistant panel UI, new photo-upload/vision flow. |
| Frontend | `app/modules/hub/vad/vad.js` / `vad-worklet.js` | Voice-activity detection, auto-stop after silence. |
| Frontend | `index.html` | Assistant panel markup (`data-hub-panel="assistant-text"`), CSP allowances for audio/blob, Butler header. |
| Frontend | `app/modules/assistant/index.js` | Assistant session factory + UI helpers (vision formatting, photo bubble models). |
| Frontend | `app/modules/assistant/actions.js` | Processes backend actions (intake suggestions, open module, etc.). |
| Docs | `docs/Voice Assistant roadmap.md` | Phase-by-phase roadmap + QA instructions. |
| Backend | `supabase/functions/midas-transcribe/index.ts` | Whisper proxy for audio uploads. |
| Backend | `supabase/functions/midas-assistant/index.ts` | OpenAI Responses gateway for text/voice conversations. |
| Backend | `supabase/functions/midas-vision/index.ts` | Vision proxy: accepts Base64 photo + history and returns analysis/reply. |
| Backend | `supabase/functions/midas-tts/index.ts` | TTS proxy (`gpt-4o-mini-tts`). |

Edge functions are deployed via `supabase functions deploy <name> --project-ref jlylmservssinsavlkdi`; secrets live in the Supabase Edge secret store.

---

## 3. Voice & Text Loop (Frontend)

1. **Start/Stop** – `handleVoiceTrigger()` toggles recording; `startVoiceRecording()` sets up `MediaRecorder`, `voiceCtrl` keeps state.
2. **Transcribe** – `transcribeAudio()` builds `FormData` (`audio`) and calls `/midas-transcribe`; UI switches to `thinking`.
3. **Assistant Roundtrip** – `fetchAssistantReply()` sends conversation history + `session_id` to `/midas-assistant` (same endpoint for voice + text). Replies include optional `actions`.
4. **TTS Playback** – `requestTtsAudio()` fetches `/midas-tts`, `playVoiceAudio()` updates the orbit state to `speaking`.
5. **State Labels & Safety** – `VOICE_STATE_LABELS` + fallback reply keep UX predictable; VAD stops after 1 s silence.
6. **Voice Gate Hook** – `createAssistantSession` listens to `AppModules.hub.isVoiceReady/onVoiceGateChange`. If auth/boot switches to “unknown”, the session shuts down with the system message “Voice deaktiviert – bitte warten”.
7. **Foto-Analyse (Phase 3.2)** – Camera button short-press => system camera, long-press => gallery/file picker. Upload pipeline: `handleAssistantPhotoSelected` → `readFileAsDataUrl` (fallback `arrayBufferToDataUrl`). Chat bubble shows thumbnail + “Analyse läuft …”. Once `/midas-vision` responds, `assistantUi.formatVisionResultText()` renders water/salt/protein + recommendation; failures paint the bubble red and expose a retry button. All results are display-only (no saving yet).

---

## 4. Backend Flow Highlights

- **midas-transcribe**: CORS-friendly, expects `audio` multipart field, proxies to Whisper (`gpt-4o-transcribe`).
- **midas-assistant**: Shared for voice/text, builds prompts via `buildChatMessages()`, calls OpenAI Responses API, returns `{ reply, actions, meta }`.
- **midas-vision**: Validates payload `{ image_base64, history?, session_id? }`, enforces ~6 MB limit, generates photo prompt, calls OpenAI Responses (Vision) and returns `{ reply, meta, analysis }`. Client only displays the analysis.
- **midas-tts**: Accepts `{ text }`, returns Base64 audio (voice `verse`).
- **Supabase Headers**: GitHub Pages hit the live Supabase REST endpoints (headers from `getConf`); local dev proxies through `/api/midas-*`.

---

## 5. Diagnostics & QA

- Browser console tags: `[midas-voice]`, `[assistant-context]`, `[assistant-vision] …`.
- Supabase CLI: `supabase functions logs <name> --project-ref jlylmservssinsavlkdi`.
- Roadmap doc enumerates acceptance steps per phase (e.g., Boot overlay, voice gate, photo upload).
- QA focus for 3.2: Photo bubble shows thumbnail + “Analyse läuft …”, final text lists water/salt/protein, retry button appears on failure, no duplicate touch-log spam.

---

## 6. Security & Edge Considerations

- No OpenAI keys/Secrets in the browser; all requests hit Supabase Edge.
- CSP only allows `self` + `blob:` for audio/media.
- Graceful fallbacks ensure UI returns to `idle` on network errors.
- Touch log captures `[assistant-vision]` start/success/fail for later debugging.

---

## 7. Roadmap Snapshot

- ✅ Phase 1.1–1.4: Voice capture, transcribe, assistant, TTS.
- ✅ Phase 1.5/1.6: Orbit glow + greeting.
- ✅ Phase 3.1: Assistant text UI (Butler header, chat input).
- ✅ Phase 3.2: Foto-Upload via `midas-vision` (display-only). Diktiermodus (Web Speech) still pending.
- ⏳ Phase 4: Allowed actions (intake save, doctor routing) + appointments module.
- ⏳ Phase 5+: Suggest/confirm card persistence, streaming TTS, wake word, offline support.

Updates follow as future phases land (text enhancements, actions, scheduling).
