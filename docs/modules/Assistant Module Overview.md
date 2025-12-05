# Assistant Module – Functional Overview

This overview captures the current scope of the MIDAS Assistant (voice + text). It mirrors the Auth overview and explains frontend/back‑end responsibilities plus QA considerations.

---

## 1. Goal

- End-to-end assistant workflow: Capture → Transcribe → Assistant → (optional) TTS/Playback.
- Persona **“MIDAS”**: short, friendly, factual – no blind guesses, no Diagnosen.
- Single Assistant surface for text chat, voice needle and photo analysis.

---

## 2. Core Components

| Layer | File | Purpose |
| --- | --- | --- |
| Frontend | `app/modules/hub/index.js` | Voice controller, chat orchestration, state machine (`idle/listening/thinking/speaking/error`), playback handling, assistant panel UI, photo-upload/vision flow und Butler-Kontext-Gluing (Intake, Termine, Profil). |
| Frontend | `app/modules/hub/vad/vad.js` + `vad-worklet.js` | Voice-activity detection, auto-stop after silence. |
| Frontend | `index.html` | Assistant panel markup (`data-hub-panel="assistant-text"`), CSP allowances for audio/blob, Butler header. |
| Frontend | `app/modules/assistant/index.js` | Assistant session factory + UI helpers (vision formatting, photo bubble models). |
| Frontend | `app/modules/assistant/actions.js` | Processes backend actions (intake suggestions, panel jumps, etc.). |
| Frontend | `app/modules/appointments/index.js` | Terminpanel + Butler Snapshot (Supabase `appointments_v2`, Event `appointments:changed`). |
| Frontend | `app/modules/profile/index.js` | Health-Profil Panel (`user_profile` CRUD, Event `profile:changed` für Charts & Butler). |
| Docs | `docs/Voice Assistant roadmap.md` | Phase-by-phase roadmap + QA instructions. |
| Backend | `supabase/functions/midas-transcribe/index.ts` | Whisper proxy for audio uploads. |
| Backend | `supabase/functions/midas-assistant/index.ts` | OpenAI Responses gateway für Text/Voice Gespräche. |
| Backend | `supabase/functions/midas-vision/index.ts` | Vision proxy: Base64 Foto + Kontext -> Analyse. |
| Backend | `supabase/functions/midas-tts/index.ts` | TTS proxy (`gpt-4o-mini-tts`). |

Edge functions are deployed via `supabase functions deploy <name> --project-ref jlylmservssinsavlkdi`; secrets leben in der Supabase Edge secret store.

---

## 3. Voice & Text Loop (Frontend)

1. **Start/Stop** – `handleVoiceTrigger()` toggelt Aufnahme; `startVoiceRecording()` initialisiert `MediaRecorder`, `voiceCtrl` hält State.
2. **Transcribe** – `transcribeAudio()` baut `FormData` (`audio`) und ruft `/midas-transcribe`; UI schaltet auf `thinking`.
3. **Assistant Roundtrip** – `fetchAssistantReply()` sendet History + `session_id` an `/midas-assistant` (gemeinsam für Voice/Text). Antworten enthalten optional `actions`.
4. **TTS Playback** – `requestTtsAudio()` ruft `/midas-tts`, `playVoiceAudio()` setzt Orbit-State auf `speaking`.
5. **State Labels & Safety** – `VOICE_STATE_LABELS` + Fallback Reply halten UX konsistent; VAD stoppt nach ~1 s Silence.
6. **Voice Gate Hook** – `createAssistantSession` hört auf `AppModules.hub.isVoiceReady` / `onVoiceGateChange`. Wenn Boot/Auth auf „unknown“ fällt, wird die Session mit „Voice deaktiviert – bitte warten“ beendet.
7. **Foto-Analyse (Phase 3.2)** – Camera Button short press → Systemkamera, long press → Galerie. Upload-Pipeline: `handleAssistantPhotoSelected` → `readFileAsDataUrl`. Bubble zeigt Thumbnail + „Analyse läuft…“, nach `/midas-vision`-Antwort werden Wasser/Salz/Protein + Empfehlung gerendert (Anzeige-only).

### 3.1 Butler Header Context (Phase 4.2 + 4.3)

- `app/modules/appointments/index.js` liefert Upcoming-Termine aus Supabase `appointments_v2` (Repeat-Regeln, Status, Sync-Events).
- `app/modules/profile/index.js` ersetzt das frühere Hilfe-Panel: Orbit Nord-West öffnet das Formular, speichert in `user_profile` (Name, Geburtsdatum, Größe, CKD-Stufe, Medikation, Salz-/Protein-Limits, Rauchstatus, Lifestyle) und feuert `profile:changed`.
- `refreshAssistantContext()` wartet auf Intake-Snapshot **und** Termine **und** Profil; Butler-Header zeigt maximal zwei Termine sowie einen Profil-Hinweis („Salzlimit 5 g, CKD G3a A1“) oder fallback „Profil fehlt“.
- Orbit-Buttons „Termine“ und „Profil“ triggern beim Öffnen `sync({ reason: 'panel-open' })`, damit Panel + Butler denselben Stand haben.
- QA: Assistant-Header reagiert sofort auf Insert/Delete/Done/Profile-Save; Touch-Log liefert höchstens einen Refresh pro Event.

### 3.2 Hybrid Panel Animation (Phase 4.4)

- Hub-Panels verwenden einen hybriden Performance-Modus: `body.dataset.panelPerf` wird über eine Media Query gesetzt, Mobile-Geräte (<1025 px) nutzen blur-freie, kurze Keyframes (`hub-panel-zoom-in/out-mobile`), Desktop behält die cineastischen Varianten (`…-desktop`).
- Orbit/Aura verhalten sich entsprechend: auf Mobile wird bei geöffnetem Panel nur leicht gedimmt, auf Desktop laufen weiterhin Glow-/Pulse-Animationen.
- QA: Siehe `docs/QA_CHECKS.md` Phase 4.4 – prüft Animationen, Touch-Log und Overlay-Verhalten.

### 3.3 Suggest & Confirm Layer (Phase 5.1)

- `assistantSuggestStore` (Singleton) sammelt pro Assistant-Roundtrip Snapshots aus Intake (`refreshAssistantContext`), Terminen (`appointments:changed`) und Profil (`profile:changed`) und stellt sie Suggestion-UI sowie Follow-up bereit.
- Vision/Text-Responses können `actions` wie `suggest_intake`/`confirm_intake` liefern. Diese landen in `app/modules/assistant/actions.js`, das Suggestion-Metriken (Wasser/Salz/Protein + Confidence) extrahiert und den Store füttert.
- UI: `app/modules/assistant/suggest-ui.js` rendert eine Card mit Titel, Metrics, Empfehlung, Buttons **Ja/Nein** plus Dismiss. Events:
  - `assistant:suggest-confirm` → Hub `handleSuggestionConfirmRequest()` ruft Allowed Action `intake_save`.
  - `assistant:suggest-answer` (Nein) verwirft Suggestion + Touchlog.
- Follow-up: Nach erfolgreichem `intake_save` (egal ob Suggestion oder manuell) feuert `assistant:action-success` → Hub `runIntakeSaveFollowup()` refresht Kontext und generiert den Mini-Report „Resttag“ (Salz/Protein-Budget, nächster Termin). Messaging läuft über `appendAssistantMessage`.

### 3.4 Allowed Actions & Guard Rails (Phase 5.2)

- `app/modules/assistant/allowed-actions.js`: zentrale Whitelist + Guard (Stage ≥ INIT_UI, Auth ≠ unknown, Supabase vorhanden). Enthält Touchlog/Diag-Logging mit Quelle und sendet Erfolg/Fehler als CustomEvent.
- `runAllowedAction()` (Hub) nutzt den Helper für Textchat, Suggest-Card und Voice. Erfolgreiche Actions emittieren `assistant:action-success` (z.B. Intake-Save) und protokollieren `[assistant-allowed] success action=intake_save source=suggestion-card`.
- `app/modules/assistant/actions.js` verarbeitet die Action Payloads. `open_module` mappt Klartext (intake, vitals, appointments, profile, doctor/list, doctor/chart, assistant/voice) auf Orbit-Buttons oder `hub.openDoctorPanel({ startMode })`; Alias-Map ist erweiterbar (z.B. „profil“, „personaldaten“, „voicechat“).
- Weitere Actions wie `show_status`, `highlight`, `ask_confirmation`, `transition_to_*` laufen ebenfalls durch den Helper – kein Intent-Parser mehr nötig.
- `assistant:action-request` CustomEvents (z.B. Buttons im Chat) und Voice-„bestätigen“-Flows verwenden dieselbe Pipeline, wodurch Stage/Auth/Logging konsistent sind.

### 3.5 Day Plan Helper (Phase 5.3)

- `app/modules/assistant/day-plan.js` exportiert `generateDayPlan(snapshot, options)`. Snapshot = Intake totals, Termine (geordnet), Profil; Option erlaubt eigenen DateFormatter.
- Output: `{ lines, hasWarnings }` – Zeilen enthalten Salz/Protein-Differenzen (Standard 5 g/110 g, falls kein Profil), Termin-Merker und optional Suggestion-Recommendation.
- `runIntakeSaveFollowup()` (Hub) nutzt den Helper für jeden Intake-Save, schreibt Chat-Meldung und löst bei Voice-Konversation zusätzlich eine `assistant:voice-request` mit identischem Text aus.

---

## 4. Backend Flow Highlights

- **midas-transcribe**: CORS-friendly, erwartet `audio` multipart field, proxied auf Whisper (`gpt-4o-transcribe`).
- **midas-assistant**: Shared für Voice/Text, baut Prompts via `buildChatMessages()` + Persona/Profil, ruft OpenAI Responses API und liefert `{ reply, actions, meta }`. Profilwerte (CKD, Medikation, Limits) werden seit Phase 4.3 automatisch in den Systemprompt injiziert.
- **midas-vision**: Validiert `{ image_base64, history?, profile? }`, 6 MB Limit, ruft OpenAI Responses (Vision) und liefert `{ analysis, reply }`. Der Client stellt nur die Analyse dar.
- **midas-tts**: Nimmt `{ text }`, liefert Base64 Audio (Stimme `verse`).
- **Supabase Headers**: GitHub Pages benutzen Live-REST-Endpoints (Konfiguration aus `getConf`); lokale Dev-Server proxien `/api/midas-*`.

---

## 5. Diagnostics & QA

- Console Tags: `[midas-voice]`, `[assistant-context]`, `[assistant-vision]`.
- Touch Log: `[assistant-context] snapshot start/done`, `[assistant-vision] analyse …`.
- QA-Pack siehe `docs/QA_CHECKS.md` (Phasen 3.2, 4.1, 4.2, 4.3). Neue Checks (4.3) stellen sicher, dass Profil CRUD + Butler + Charts synchron bleiben.

---

## 6. Security & Edge Considerations

- Keine OpenAI Keys im Browser; alle Aufrufe landen bei Supabase Edge.
- CSP erlaubt nur `self` + `blob:` für Audio/Media.
- Graceful fallbacks bringen UI zurück nach `idle`, falls Netzwerk/Edge 500 liefert.
- Profil-/Termin-Schreibzugriffe laufen über Supabase RLS (user_id bound).

---

## 7. Roadmap Snapshot

- Phase 3.1: Assistant Text UI (Butler header, chat input).
- Phase 3.2: Foto-Upload via `midas-vision` (Anzeige-only).
- Phase 4.1: Vitals/Doctor Konsolidierung (Butler relevanter Kontext).
- Phase 4.2: Termin-Panel + Butler Snapshot (echte Supabase Daten).
- Phase 4.3: Health-Profil Panel, Charts lesen Größe aus Supabase, Assistant-Prompts erhalten Persona Kontext.
- Phase 5+: Suggest/Confirm Card Persistence, Aktionen, Streaming TTS, Wake Word, Offline Support.

Updates folgen sobald weitere Phasen landen.
