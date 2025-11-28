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

3. **Diktiermodus (planned/optional)** ? hook Web Speech API (or reuse VAD capture) to fill the chat input quickly; offline-friendly fallback.

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


New roadmap für CODEX Abgleich:
# MIDAS Voice Assistant – Incremental Roadmap (final, “Butler + Foodcoach”)

**Goal:** A modular assistant loop for MIDAS  
→ **Voice = hands-free Butler** (steuert UI + loggt Intakes direkt)  
→ **Textchat = Foodcoach** (Fotoanalyse → Vorschlag → *optional* loggen)  
→ **No chat archive**, Session-only memory, **Intakes-first**.

---

## 0) Bootstrap Layer (Pre-Init) — nice-to-have, darf NICHT blocken
- **0.1 Boot-Logger** (`<head>`)  
  Fängt Syntaxfehler, Promise-Rejections, CSP/Ladefehler → `localStorage: midas_bootlog_v1`
- **0.2 Bootlog-Merge**  
  Merge nach App-Start in Touchlog (`midas_touchlog_vX`) → Bootlog danach löschen
- **0.3 Bootstrap Validator (optional later)**  
  Checks: Supabase ready, (PWA/SW später), AudioContext erlaubt, KI-Session init, etc.  
  Fail → Diagnose-Screen
- **0.4 Bootstrap Finish**  
  `midas-state="idle"` + Touchlog “BOOT OK – vX.Y.Z” + Voice Engine ready

---

## 1) Frontend – Voice Controller (Phase 1 ✅)
Implementiert in `app/modules/hub/index.js`, Styling in `app/styles/hub.css`.

1. **Audio Capture Skeleton ✅**
2. **Transcribe Integration ✅** (voll testbar sobald Billing aktiv)
3. **Assistant Roundtrip ✅**
4. **TTS Playback ✅**
5. **Glow-Ring Animation ✅/WIP**  
   Idle/listening/thinking/speaking/error → Ring/Aura
6. **Needle Trigger Feedback ✅**  
   Nadel = Start/Stop, Press-Scale
7. **Auto-stop via VAD ✅**  
   1s Stille → stop capture

**Add-on (jetzt gerade im Bau):**
- **Conversation Loop / End-of-Conversation**  
  “Brauchst du sonst noch was?” → erkennt “nein danke” etc. → beendet Session clean.

---

## 2) Backend – Supabase Edge Functions (Phase 2 ✅)
1. **midas-transcribe ✅** (Whisper / `gpt-4o-transcribe`)
2. **midas-assistant ✅** (Responses API, System Prompt, voice/text mode)
3. **midas-tts ✅** (OpenAI TTS; Audio output + fallback)
4. **midas-vision ✅** (Foto → strukturierter Intake-Vorschlag)

> Prinzip: **Kein OpenAI-Key im Browser**, alles über Supabase Functions.

---

## 3) Assistant UI – Textchat / Foodcoach (Phase 3)
1. **Assistant Text UI ✅**  
   Orbit-Button öffnet Textchat, RAM-History, Session-only
2. **Foto-Analyse ✅**  
   Kamera → base64 → `/midas-vision` → **Wasser/Salz/Protein + Empfehlung**
3. **Diktiermodus (optional)**  
   WebSpeech nur als “Input Hilfe” für Textbox (nicht Voice-Chat)

---

## 4) Actions & Flows (Phase 4) — HIER wird MIDAS “Butler”
### 4.1 Grundsatz: Was MIDAS darf (und was nicht)
**Allowed (jetzt):**
- `IntakeSave` (direkt loggen; Voice darf ohne Rückfrage, Text fragt standardmäßig nach)
- `OpenModule` (Hub Panels öffnen: Intakes / Vitals / Doctor / später Termine)
- `ReadSummary` (wenn Panel offen: “fass zusammen” → in Worten, ohne neue Daten zu erfinden)
- `ShowIntakeStatus` (heute / aktuell: Wasser, Salz, Protein aus DB holen und kurz einordnen)
- `StartTextChatWithCamera` (Voice kann dich in den Foto-Flow “werfen”: Panel öffnen + Kamera triggern)
- `AssistantDiagnostics` (nur App-/Session-Diagnose, kein Code lesen)

**Not allowed:**
- Chat-Persistenz in Supabase
- Code-Introspection / Self-Update / Web-Tech-Scanning
- Medizinische Diagnosen/Therapieanweisungen

**Explizit NICHT geplant (vorerst):**
- `BPSave`, `BodySave` via Voice/Text (du machst das manuell: schneller & sicherer)

### 4.2 Voice-Butler Flows (hands-free)
**Flow V1 – Quick Intake (direkt speichern):**
- User: “Trag 500 ml Wasser ein.”  
- MIDAS: speichert → bestätigt → “Noch etwas?”
- End: “Nein danke”/”passt”/… → Session endet

**Flow V2 – Status & Empfehlung (ohne Foto):**
- User: “Wie schau ich heute aus mit Salz?”  
- MIDAS: holt Tageswerte → kurzer Status + 1 next step

**Flow V3 – UI-Steuerung:**
- User: “Öffne Intakes.” / “Zeig Doctor View.”  
- MIDAS: `OpenModule` → optional `ReadSummary` wenn gefragt  
- Doctor View: nur wenn Biometrie/Unlock aktiv (Front-end Gate bleibt Boss)

**Flow V4 – Übergabe an Foodcoach (Voice → Text):**
- User: “Ich will Essen analysieren.”  
- MIDAS: öffnet Textchat + Kamera → “Mach Foto, dann sag ‘logg das’ wenn’s passt.”

### 4.3 Textchat Foodcoach Flows (Fotoanalyse)
**Flow T1 – Suggest → Confirm → Save:**
- Foto → `suggestIntake` (midas-vision liefert **konkrete** Werte, keine Spannen)
- MIDAS fragt: “Soll ich das loggen?”
- User: “Ja” → `IntakeSave`
- User: “Nein” → verwirft Vorschlag

---

## 5) Intake Copy Utilities (Phase 5) — kleiner Turbo für dich
**Warum überhaupt, wenn MIDAS schon DB kann?**  
Weil es ultra-schnell ist, um *außerhalb* von MIDAS (oder als Debug) Werte zu teilen.

- **Intake Copy Button** (nur Intakes)
  - Kopiert Datum/Zeit/Wasser/Salz/Protein
  - Format:
    - **Text** (human)
    - **Optional** “maschinenlesbar” als *eine Zeile* (kein großes JSON nötig)
      - z. B. `INTAKE|2025-11-28|13:05|water_ml=500|salt_g=2.1|protein_g=52`
  - (Optional) “Copy last intake” vs “Copy today totals”

> JSON ist *nicht* zu viel – aber für deinen Use Case reicht oft ein **parsebarer Einzeiler**.

---

## 6) Termin- & Arztmodul (Phase 6 – später, nach PWA/TWA stabil)
- Terminliste + Arztkartei
- Voice: “Nächster Termin?” “Bring mich zum …”
- `DoctorRouting` → Maps deep link

---

## 7) Optional / Future
- Streaming TTS
- Wakeword
- Offline fallback (Text-only)
- Wearables/Watch readiness (erst **wenn** App & Actions sauber sind)

---

## 8) Commit-Strategie
Jede Phase → eigener Commit + mini QA Note + Changelog Snippet  
Feature-Flag bleibt: Voice komplett deaktivierbar.

---

## Next Steps (dein aktueller Kurs)
1. **Conversation Loop sauber machen** (End-of-convo erkannt → Session close)
2. **Phase 4 Actions definieren** (Butler: OpenModule/ReadSummary/ShowIntakeStatus/IntakeSave)
3. **Foodcoach Confirm→Save Flow** (suggestIntake → confirm → IntakeSave; keine Spannen!)
4. **Glow-Ring Amplitude** (KITT-Style, speaking intensity)
5. Optional: **Copy Button** als Debug-/Sharing-Turbo
