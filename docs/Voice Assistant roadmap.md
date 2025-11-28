# MIDAS Voice Assistant – Incremental Roadmap



Goal: modular voice + text assistant loop (Record → Transcribe → Assistant → TTS → Playback) plus lightweight chat utilities.



---



## 0. Bootstrap Layer (Pre-Init)

- **Boot-Logger**: runs in `<head>`, catches syntax/promise/CSP/load errors into `localStorage` (`midas_bootlog_v1`).

- **Bootlog-Merge**: merges boot log into the touchlog (`midas_touchlog_vX`) on startup, then deletes the boot record.

- **Bootstrap Validator**: later checks Supabase, service worker/PWA, AudioContext grant, KI-session guard; failures show a diagnostic screen.

- **Bootstrap Finish**: sets `midas-state="idle"`, touchlog entry "BOOT OK – vX.Y.Z", voice engine ready.



> Nice-to-have – must not block the voice flow.



---



## 1. Frontend – Voice Controller (Phase 1 ✅)

1. **Audio Capture Skeleton** – MediaRecorder setup, `idle→listening` states, blob logging + fallback.

2. **Transcribe Integration** – upload to `/api/midas-transcribe`, `thinking` state, transcript logging.

3. **Assistant Roundtrip** – voice history, `/api/midas-assistant`, reply/actions stored, clean history.

4. **TTS Playback** – `/api/midas-tts`, `<audio>` playback, stop/interrupt, JSON reply hygiene (no raw `"reply"` text in TTS).

5. **Glow-Ring Animation** – idle/listening/thinking/speaking/error drive the gold ring + aura; speaking pulses with GPT audio amplitude (KITT style).

6. **Needle Trigger Feedback** – center icon drives voice chat with press animation + state glow.

7. **Auto-stop via VAD** – silence detection (1 s) pauses capture; VAD worklet + buffers live under `app/modules/hub/vad/`.



> All implemented in `app/modules/hub/index.js`, `app/styles/hub.css`, `index.html`.



---



## 2. Backend – Edge Functions (Phase 2 ✅)

1. **midas-transcribe** - Whisper (`gpt-4o-transcribe`), CORS, logging, error passthrough.
2. **midas-assistant** - System prompt + `voice` mode, session/history, text-only payloads für Frontend.
3. **midas-tts** - OpenAI TTS (Fallback zu ElevenLabs), MP3/WebM output mit JSON fallback.
4. **midas-vision** - Responses API (Vision) proxyt Foto-Uploads; nimmt Base64 + Verlauf entgegen, liefert Wasser/Salz/Protein + Empfehlung zurück.


---



## 3. Assistant UI ? Chat Module (Phase 3)

Edge Function only: Text-, Voice- und Foto-Pfade laufen ?ber Supabase (`midas-assistant`, `midas-vision`); kein direkter OpenAI-Call oder OAuth-Redirect im Browser.

1. **Assistant Text UI (done)** ? NE orbit button opens `assistant-text`; transient RAM history, Replies kommen ?ber `midas-assistant` (gleicher Flow wie Voice), keine Persistence.

2. **Foto-Analyse (done)** ? camera button captures/selects photo ? base64 ? `/midas-vision` (Supabase Edge) ? OpenAI Vision (`gpt-4.1-mini`). Liefert Wasser/Salz/Protein + Empfehlung, kein Client-Key im Browser.

3. **Diktiermodus (planned)** ? hook Web Speech API (or reuse VAD capture) to fill the chat input quickly; offline-friendly fallback.

4. **Intake Auto-Fill (planned)** ? Vision/Text-Antworten liefern strukturierte `suggestIntake`-Actions mit Salz-/Protein-Schätzung, Session-ID und Kontext. Frontend speichert die vorgeschlagenen Werte und fragt nach ("Soll ich die Zahlen loggen?"). Bei Zustimmung (Keywords wie "ja", "logg das", "passt") wird direkt ein Intake-Eintrag erstellt; Ablehnung verwirft die Schätzung.





---



## 4. Datenaktionen – Allowed Actions (Phase 4)

- Allowed: `IntakeSave`, `BPSave`, `BodySave`, `AddNote`, `OpenModule`, `AssistantDiagnostics`, `DoctorRouting`.

- Not allowed: Chat storage, code introspection, self-updates, technology scans.

- Upcoming Flow: `suggestIntake` (Edge Function liefert Werte) -> `confirmIntake` (User-Zusage im Text/Voice-Flow) -> `IntakeSave` (Supabase REST). Salz- und Proteinwerte müssen eindeutig sein, damit der Assistent nicht "zwischen 5 und 7 g" zurückliefert, sondern konkret speichert.



---



## 5. Copy Utilities (Phase 5)

- **Intake Copy Button** – copies Datum/Zeit/Wasser/Salz/Protein for quick nutrition chats.



---



## 6. Termin- & Arztmodul (Phase 6)

- Terminliste, Arztkartei, Google Maps routing ("Bring mich zum Kardiologen"), voice queries ("Wann ist mein nächster Termin?").



---



## 7. Zukunft / Optional (Phase 7)

- Streaming TTS, wakeword ("Midas?"), offline text fallback, Health-Briefings ("Deine Woche war …"), wearables/watches, training insights.



---



## 8. Commit-Strategie

Each phase → dedicated commit + README/Changelog/QA snippet; keep a feature flag to disable the voice module when needed.



---



## Next Steps (current focus)

1. Harden & QA `/midas-vision` (Edge) f?r Foto-Analysen in PWA/TWA (Logging, "trag ein"-CTA, Limits).
2. Add dictation hook/Web Speech integration for the chat input (Phase 3.3).
3. Optional: revisit Bootstrap Layer items when voice/chat remain stable.


