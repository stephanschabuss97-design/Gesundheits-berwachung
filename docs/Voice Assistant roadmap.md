# MIDAS Voice Assistant – Butler & Foodcoach Roadmap

Ziel: Ein modularer Helfer für MIDAS, der Voice (Hands-Free-Butler) und Text/Fotos (Foodcoach) vereint.

- Voice: steuert Panels, loggt Wasser/Protein/Satzwerte direkt und hält die Konversation kurz & hilfreich.
- Text/Foodcoach: Fotoanalyse → konkrete Vorschläge → optionales Logging.
- Keine Chat-Archivierung, alles läuft in Session-RAM; Fokus auf Intakes.

---

## 0. Foundations / Bootstrap Layer

Phase 0 ist mehr als Logging – es ist der Schritt vom Prototyp zur echten App. Fünf Baustellen:

| Task | Status | Beschreibung |
| --- | --- | --- |
| 0.1 Bootstrap Flow rebuild | TODO | Neuer Bootfluss: `BOOT → AUTH_CHECK → INIT_CORE → INIT_MODULES → INIT_UI → IDLE`. UI bleibt geblockt, bis Auth/Supabase/Audio bestätigt sind; kein halb initialisierter Zustand. |
| 0.2 Cleanup Pass | TODO | Alte Logger, doppelte Guards, try/catch-Friedhöfe, frühe Workarounds entfernen. State-Machine vereinheitlichen, `/core` entschlacken. |
| 0.3 Auth Flow Fix | TODO | Pre-render Auth Gate: App rendert erst nach Supabase-Entscheid (logged in/out). Kein „UI klickbar bevor Login da ist“. |
| 0.4 Persistent Login Mode | TODO | `persistSession: true`, Silent Refresh für Google OAuth, PWA-ready Session Restore → App öffnet sofort eingeloggt (sofern Session gültig). |
| 0.5 Performance Pass | TODO | Nicht-kritische Module lazy laden, initiales JS klein halten, Charts/Vision/Doctor erst nach Idle booten. |
| 0.6 Voice Safety Init | TODO | Voice/Needle bleiben deaktiviert bis Auth confirmed + Bootflow durchlaufen; keine Audio-Nutzung vor `state=idle`. |

---

## 1. Frontend – Voice Controller (Phase 1) · _DONE_

Alles in `app/modules/hub/index.js` + Styles in `app/styles/hub.css`.

1. Audio Capture Skeleton · ✅ MediaRecorder, States, Blob-Logging.
2. Transcribe Integration · ✅ `/midas-transcribe`, `thinking`-State, Transcript-Logging.
3. Assistant Roundtrip · ✅ History → `/midas-assistant`; Reply+Actions werden sauber geparst.
4. TTS Playback · ✅ `/midas-tts`, `<audio>`-Pipeline inkl. Interrupt/Retry.
5. Glow-Ring Animation · ✅ Idle/Listening/Thinking/Speaking/Error → Ring/Aura.
6. Needle Trigger Feedback · ✅ Button steuert die Session, inklusive Press-Animation.
7. Auto-stop via VAD · ✅ 1 s Stille stoppt Aufnahme (Worklet in `app/modules/hub/vad`).
8. Conversation Loop Endings · ✅ Phrasen wie „nein danke“ beenden die Session sauber.

---

## 2. Backend – Supabase Edge Functions (Phase 2) · _DONE_

| Function | Status | Details |
| --- | --- | --- |
| `midas-transcribe` | ✅ | Whisper (`gpt-4o-transcribe`), FormData Upload, CORS, Logging. |
| `midas-assistant` | ✅ | Responses API, System Prompt, Text & Voice Mode, liefert `{ reply, actions, meta }`. |
| `midas-tts` | ✅ | `gpt-4o-mini-tts` (Voice „cedar“), liefert Base64 oder Raw Audio. |
| `midas-vision` | ✅ | Foto-Proxy → gpt-4.1-mini, liefert Wasser/Salz/Protein + Empfehlung. |

Secrets liegen ausschließlich in Supabase (`supabase functions deploy <name> --project-ref jlylmservssinsavlkdi`).

---

## 3. Assistant UI – Textchat & Fotoanalyse (Phase 3)

| Task | Status | Notizen |
| --- | --- | --- |
| Assistant Text UI | ✅ | Orbit-Button öffnet Panel `assistant-text`; Session-only History; identischer Edge Endpoint wie Voice. |
| Foto-Analyse | ✅ | Kamera/File → Base64 → `/midas-vision` → strukturierte Antwort (Salz/Protein/Wasser + Empfehlung). |
| Diktiermodus | PLANNED | Web Speech API nur als Input-Helfer (nicht Teil des Voice-Loops). |
| Intake Auto-Fill | PLANNED | Vision/Text liefern `suggestIntake` + Werte; Frontend fragt „Soll ich das so loggen?“ und schreibt bei Zustimmung direkt in Intakes. |

---

## 4. Actions & Flows – Voice Butler / Hybrid-Engine (Phase 4)

### 4.1 Intent Engine (JS Fast Path) · _PLANNED_

- `detectIntent(transcript)` in `app/modules/hub/voice-intent.js`.
- Regex/Pattern-Matching; kein KI-Roundtrip.
- `executeIntent(intent)` ruft DOM- oder Supabase-Helper.
- Beispiele (Fast Path):
  - „öffne intakes“ → `openModule("intakes")`
  - „wasser 300 ml“ → `saveWater(300)`
  - „protein 25 gramm“ → `saveIntake({ protein_g: 25 })`
  - „schließ den chat“ → Conversation-Ende
- Fallback (Smart Path): alles, was die Intent-Engine nicht versteht, läuft wie bisher über `/midas-assistant`.

### 4.2 Allowed Actions (aktuell freigegeben)

- `IntakeSave` – Voice (Fast Path) darf eindeutige Zahlen sofort loggen; Text fragt standardmäßig nach.
- `OpenModule` – Panels (intakes/vitals/doctor) via JS oder KI.
- `ReadSummary` – Kurze Zusammenfassung offener Panels; meist KI, optional JS.
- `ShowIntakeStatus` – Tageswerte laden und einordnen.
- `StartTextChatWithCamera` – Voice kann in Foto-Flow übergeben („Ich will mein Essen analysieren“).
- `AssistantDiagnostics` – Session-/Konfig-Hinweise (kein Code introspection).

Nicht erlaubt: Chat-Persistenz, Self-Updates, Tech-Scanning, medizinische Diagnosen. Blutdruck & Körperdaten bleiben manuell im UI.

### 4.3 Voice-Butler Flows (Hands-Free)

1. **V1 Quick Intake** – „Trag 500 ml Wasser ein.“ → Fast Path speichert, Cedar bestätigt.
2. **V2 Status & Empfehlung** – „Wie schau ich heute aus mit Salz?“ → JS zieht Zahlen, KI formuliert Antwort.
3. **V3 UI-Steuerung** – „Öffne Intakes.“ → Panel-Switch sofort, optional kurze Bestätigung.
4. **V4 Übergabe an Foodcoach** – „Ich will mein Essen analysieren.“ → Textchat + Kamera öffnen, Hinweis geben; danach Foto-Flow (Suggest → Confirm → Save).

### 4.4 Textchat Foodcoach Flows

- **T1 Suggest → Confirm → Save** – Fotoanalyse liefert konkrete Salz-/Proteinwerte. MIDAS fragt „Soll ich das so loggen?“. „Ja“ → `IntakeSave`; „Nein“ → verwerfen.

---

## 5. Copy Utilities (Phase 5) · _PLANNED_

- Intake Copy Button für Debugging/Sharing.
- Formate:
  - Menschlich lesbarer Text.
  - Parsebarer Einzeiler: `INTAKE|2025-11-28|13:05|water_ml=500|salt_g=2.1|protein_g=52`.

---

## 6. Termin- & Arztmodul (Phase 6) · _PLANNED_

- Terminliste & Arztkartei.
- Voice Queries („Wann ist mein nächster Termin?“, „Bring mich zum Nephrologen.“).
- DoctorRouting → Maps Deep Links, abgesichert über bestehende Unlocks/Biometrie.

---

## 7. Optional / Zukunft (Phase 7)

- Streaming TTS.
- Wakeword („Midas?“) sobald energie-/architekturfreundlich.
- Offline-Text-Assistant (kein OpenAI).
- Wearables/Watch readiness.
- Health-Briefings („Deine Woche war …“) als geschedulte Reports.

---

## 8. Commit- & QA-Strategie

- Jede Phase = eigener Commit inkl. Mini-QA & Changelog.
- Feature-Flag behalten, um den Assistant bei Bedarf zu deaktivieren.
- Hybrid-Engine (voice-intent.js) sauber einkapseln, damit Codex gezielt daran arbeiten kann.

---

## Aktuelle Fokus-Themen

1. `/midas-vision` weiter hardenen (Limits, Logging, Suggest→Confirm Flow).
2. Diktiermodus & Intake-Auto-Fill (Text + Voice) finalisieren.
3. Intent Engine + Allowed Actions (Fast Path) implementieren.
4. Bootstrap Layer & Copy Utilities vorbereiten, sobald die Kernflows stabil laufen.
