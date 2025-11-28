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

´´´

New roadmap für CODEX Abgleich:
MIDAS Voice Assistant – Incremental Roadmap (final, “Butler + Foodcoach”)

Goal: A modular assistant loop for MIDAS
→ Voice = hands-free Butler (steuert UI + loggt Intakes direkt, mit Hybrid-Engine)
→ Textchat = Foodcoach (Fotoanalyse → Vorschlag → optional loggen)
→ No chat archive, Session-only memory, Intakes-first.

## 0) Bootstrap Layer (Pre-Init) — nice-to-have, darf NICHT blocken

**1 Boot-Logger (<head>)**
Fängt Syntaxfehler, Promise-Rejections, CSP/Ladefehler → localStorage: midas_bootlog_v1
**2 Bootlog-Merge**
Merge nach App-Start in Touchlog (midas_touchlog_vX), danach Bootlog löschen
**3 Bootstrap Validator (optional später)**
Checks: Supabase ready, (PWA/SW später), AudioContext erlaubt, KI-Session init etc.
Fail → Diagnose-Screen
**4 Bootstrap Finish**
midas-state="idle" + Touchlog “BOOT OK – vX.Y.Z” + Voice Engine ready

## 1) Frontend – Voice Controller (Phase 1 ✅)
Implementiert in app/modules/hub/index.js, Styling in app/styles/hub.css.

**1 Audio Capture Skeleton** ✅
MediaRecorder, idle→listening State, Blob-Logging
**2 Transcribe Integration** ✅
Upload zu /midas-transcribe, thinking State, Transcript-Logging
**3 Assistant Roundtrip** ✅
Request → /midas-assistant → Antwort/Actions
**4 TTS Playback** ✅
/midas-tts, <audio>-Playback, Stop/Interrupt, saubere JSON-Struktur
**5 Glow-Ring Animation** ✅
idle/listening/thinking/speaking/error → Ring/Aura-State
**6 Needle Trigger Feedback** ✅
Nadel-Button startet/stoppt Voice-Session, Press-Animation + State-Glow
**7 Auto-stop via VAD** ✅
1 s Stille → Aufnahme wird gestoppt
**8 Conversation Loop / End-of-Conversation** ✅
„Brauchst du sonst noch was?“ → erkennt Phrasen wie „nein danke“ etc. → beendet Session sauber.

## 2) Backend – Supabase Edge Functions (Phase 2 ✅)

**1 midas-transcribe** ✅
Whisper / gpt-4o-transcribe, CORS, Logging, Error-Passthrough
**2 midas-assistant** ✅
Responses API, System Prompt, mode = text | voice, Session/Meta
**3 midas-tts** ✅
OpenAI TTS (gpt-4o-mini-tts), Default-Stimme cedar, Emotion-Parameter (calm, motivating, empathic, focusing, encouraging)
**4 midas-vision** ✅
Foto → Base64 → /midas-vision → gpt-4.1-mini → Wasser/Salz/Protein + Empfehlung (kein OpenAI-Key im Browser)

## 3) Assistant UI – Textchat / Foodcoach (Phase 3)

**1 Assistant Text UI** ✅
Orbit-Button öffnet Textchat; RAM-History, Session-only; Anfragen laufen über midas-assistant.

**2 Foto-Analyse** ✅
Kamera / File-Picker → Base64 → /midas-vision → strukturierte Antwort (Wasser/Salz/Protein + Kurz-Empfehlung).

**3 Diktiermodus** (optional)
WebSpeech nur als Input-Hilfe für das Textfeld
→ nicht Teil des Voice-Assistant-Loops, sondern nur schnellere Eingabe für den Textchat.

## 4) Actions & Flows (Phase 4) — HIER wird MIDAS zum “Butler”
4.0 Voice Intent Engine – Client-Side Fast Path (NEW, Hybrid-Architektur)

Ziel:
Voice bleibt über die Nadel gesteuert (press → listening → thinking → speaking), aber:
- Der Transkript-Text wird zuerst von einer lokalen Intent-Engine geprüft.
- Wenn der Befehl eindeutig ist → JS führt ihn direkt aus (Fast Path).
- Wenn unklar/komplex → Transkript geht an /midas-assistant (Smart Path).
- Fast Path (JS-only, ohne KI-Roundtrip):
- "öffne intakes" → openModule("intakes")
- "öffne doctor view" → openModule("doctor")
- "wasser 300 ml" / "300 milliliter wasser" → saveWater(300)
- "protein 25 gramm" → saveIntake({ protein_g: 25 })
- "zeig mir meine werte" → showIntakeStatusToday()
- "schließ den chat" / "fertig" → Conversation-Loop-Ende
- Smart Path (KI, über /midas-assistant):
- „Wie schaut mein Tag heute aus?“
- „Wie geht es meinen Nieren insgesamt?“
- „Kannst du mir meine Werte erklären?“
- „Soll ich heute noch etwas trinken/essen?“
- „Was sagst du zu meinem Pulsdruck?“

Technische Idee:
- detectIntent(transcript: string) → intent | null
- Lives in z. B. app/modules/hub/voice-intent.js
- Nutzt einfache Patterns/RegEx, keine KI.
- executeIntent(intent)
- Ruft UI/State-Funktionen auf (openModule, saveWater, saveIntake, showIntakeStatus etc.)
- Wenn detectIntent kein Intent findet → Transkript an /midas-assistant, wie bisher.

Ergebnis:
- Nadel-Button-Flow bleibt unverändert (kein Wakeword).
- 90 % der Steuer-Befehle laufen instant über JS.
- KI wird nur für echte „Denkarbeit“ angefragt.
- Latenz beim Steuern der App ≈ 0.

**1 Grundsatz: Was MIDAS darf (und was nicht)**

Allowed (current focus):
IntakeSave
– Intakes direkt speichern (über Voice oder Text).
– Voice darf bei klaren Zahlen direkt speichern (Fast Path).
– Text fragt standardmäßig nach („Soll ich das loggen?“).

OpenModule
– Panels im Hub öffnen: intakes, vitals, doctor (später termine).
– Wird bevorzugt über JS-Fast-Path ausgeführt.

ReadSummary
– Wenn ein Panel offen ist: kurze Zusammenfassung in Worten, ohne neue Werte zu erfinden.
– Typischerweise KI-Pfad, optional auch JS-basierte Kurz-Zusammenfassung.

ShowIntakeStatus
– Holt Tageswerte (Wasser/Salz/Protein) aus DB, ordnet sie kurz ein.

StartTextChatWithCamera
– Voice kann nahtlos in den Foto-Flow übergeben:
„Ich will Essen analysieren“ → Textchat/Cam öffnen, Hinweis geben.

AssistantDiagnostics
– Nur App-/Session-Diagnose, kein Code lesen oder introspektieren.

Not allowed:
Chat-Persistenz in Supabase (keine Archivierung).
Code-Introspection / Self-Updates / Tech-Scanning.
Medizinische Diagnosen oder Therapieempfehlungen.
Explizit NICHT geplant (vorerst):
BPSave, BodySave via Voice/Text.
→ Blutdruck und Körperdaten loggst du manuell im UI (schneller & sicherer).

**2 Voice-Butler Flows (Hands-Free, mit Hybrid-Engine)**

- Flow V1 – Quick Intake (JS-first, KI optional):
User: „Trag 500 ml Wasser ein.“
detectIntent erkennt Wasser-Intake → JS saveWater(500)
MIDAS (Cedar, emotion = encouraging oder calm):
„500 ml Wasser sind eingetragen. Brauchst du sonst noch etwas?“
User: „Nein danke.“ → Conversation-Loop beendet (end-of-session).
- Flow V2 – Status & Empfehlung (Mix aus JS + KI):
User: „Wie schau ich heute aus mit Salz?“
JS: showIntakeStatusToday() holt Zahlen
KI formatiert Antwort („Du liegst heute bei …, das ist innerhalb deines Zielbereichs.“)
- Flow V3 – UI-Steuerung (JS-only, ultra-fast):
User: „Öffne Intakes.“
JS: openModule("intakes") → sofortiger Panel-Switch
Optional: Cedar bestätigt kurz („Intakes sind offen.“).
- Flow V4 – Übergabe an Foodcoach (Voice → Text + Vision):
User: „Ich will mein Essen analysieren.“
JS: öffnet Textchat + Kamera-Panel → UI-Hinweis „Mach ein Foto und schick es mir.“
Ab hier: Foto → midas-vision → Text-Flow (Suggest → Confirm → Save).

**3 Textchat Foodcoach Flows (Fotoanalyse, Text-only)**

- Flow T1 – Suggest → Confirm → Save:
Foto → /midas-vision → konkrete Salz-/Protein-/Wasser-Schätzung (keine Spanne, sondern Wert).
MIDAS: „Ich würde das auf X g Salz und Y g Protein schätzen. Soll ich das so loggen?“
User: „Ja.“ → IntakeSave mit diesen Werten.
User: „Nein.“ → Vorschlag verwerfen, ggf. manueller Entry.

## 5) Intake Copy Utilities (Phase 5)

- Kleiner Turbo für Debugging/Sharing außerhalb von MIDAS.
- Intake Copy Button
- Kopiert Datum/Zeit/Wasser/Salz/Protein.

Formate:
- Menschlich lesbarer Text
- Optional: parsebarer Einzeiler, z. B.: INTAKE|2025-11-28|13:05|water_ml=500|salt_g=2.1|protein_g=52

## 6) Termin- & Arztmodul (Phase 6 – später, nach PWA/TWA stabil)

- Terminliste + Arztkartei
Voice: „Nächster Termin?“ / „Bring mich zum Nephrologen.“
DoctorRouting → Maps-Deep-Link o. Ä.
Sicherheitsgates im Frontend (Biometrie/Unlock) bleiben entscheidend.

## 7) Optional / Future

- Streaming TTS
- Wakeword („Midas?“) – nur falls technisch/energetisch sinnvoll
- Offline-Fallback (Text-only Assistant, kein OpenAI)
- Wearables/Watch readiness (nachdem Voice/Actions stabil sind)
- Health-Briefings („Deine Woche war…“) als geschedulte Auswertung

8) Commit-Strategie

- Jede Phase → eigener Commit + mini QA-Note + Changelog-Snippet.
- Feature-Flag bleibt: Voice-/Assistant-Modul kann komplett deaktiviert werden.
- Hybrid-Engine (Intent-Detector) bleibt klar gekapselt (voice-intent.js), damit Codex gezielt daran arbeiten kann.