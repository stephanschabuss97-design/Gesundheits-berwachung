# MIDAS Voice Assistant – Incremental Roadmap

Ziel: Vollständiger, modularer Voice- & Text-Assistent – Record → Transcribe → Assistant → TTS → Playback.

---

## 0. Bootstrap Layer (Pre-Init)
- **Boot-Logger**: läuft im `<head>`, speichert Fehler in `localStorage` (`midas_bootlog_v1`), fängt Syntax-/Promise-/CSP-Fehler.
- **Bootlog-Merge**: beim Appstart ins Touchlog integrieren (`midas_touchlog_vX`), danach löschen.
- **Bootstrap Validator**: prüft Supabase, (später) Service Worker/PWA, AudioContext, KI-Session; Fehler → Diagnose-Screen.
- **Bootstrap Finish**: setzt `midas-state="idle"`, Touchlog „BOOT OK – vX.Y.Z“.

> Nice-to-have, darf den Voice-Flow nicht blockieren.

---

## 1. Frontend – Voice Controller (Phase 1)
1. **Audio Capture Skeleton (done)**  
   MediaRecorder-Setup, States `idle → listening`, Fehlerfallback, Test: Klick → Blob im Log.
2. **Transcribe Integration (done)**  
   Upload zu `/api/midas-transcribe`, State `thinking`, Fehler zurück zu `idle`, Test: Transcript erscheint.
3. **Assistant Roundtrip**  
   Transcript in Voice-History, Request an `/api/midas-assistant`, Antwort/Actions verarbeiten, History sauber halten.
4. **TTS Playback**  
   Antwort → `/api/midas-tts`, `<audio>` abspielen, Stop/Interrupt, Cleanup.
5. **Glow-Ring Animation**  
   Aura/Nadel reagiert auf States (Listening = feiner Pulse, Speaking = breite Pulse).
6. **Nadel als Voice-Trigger**  
   Klick startet Voice, Tageszeit-Grüße („Guten Morgen, Stephan“ etc.).

---

## 2. Backend – Edge Functions (Phase 2)
1. **midas-transcribe (done)** – Whisper (gpt-4o-transcribe), CORS, Logging.
2. **midas-assistant (done)** – System Prompt + Voice Mode, History & Session-ID.
3. **midas-tts (done)** – OpenAI/ElevenLabs TTS, MP3/WebM, Fehler-Fallback mit Text.

---

## 3. Textchat Modul – Assistant UI (Phase 3)
- **assistant-text-ui**: leichtes Chatfenster (Foodcoach-Style), History nur im RAM.
- **Foto-Upload („Food Analyse“)**: Kamera-Icon, Upload → `/midas-food-analyse`, optional „trag ein“.
- **Diktiermodus**: Web Speech API, offline-fähig, für schnellen Input.

---

## 4. Datenaktionen – Allowed Actions (Phase 4)
- Erlaubt: `IntakeSave`, `BPSave`, `BodySave`, `AddNote`, `OpenModule`, `AssistantDiagnostics`, `DoctorRouting`.
- Nicht erlaubt: Chat-Archiv, Code-Lesen, Self-Updates, Tech-Scans.

---

## 5. Copy Utilities (Phase 5)
- **Intake Copy Button**: kopiert Datum/Zeit/Wasser/Salz/Protein (für Ernährungs-Chats).

---

## 6. Termin- & Arztmodul (Phase 6)
- Terminliste, Arztkartei, Google-Maps-Routing („Bring mich zum Kardiologen“), Voice-Queries („Wann ist mein nächster Termin?“).

---

## 7. Zukunft / Optional (Phase 7)
- Streaming TTS, Wakeword („Midas?“), Offline-Fallback (Text), Health-Briefings („Deine Woche war…“), Wearables.

---

## 8. Commit-Strategie
Jede Phase = eigener Commit inkl. README-/Changelog-/QA-Notiz; Voice-Feature bleibt per Flag abschaltbar.

---

## Nächste Schritte
1. Assistant-Roundtrip finalisieren.
2. TTS Playback implementieren.
3. (Optional) Bootstrapper/Logger vorbereiten.
4. Textchat-UI implementieren.
5. Glow-/Nadel-UX.
6. Intake Copy Button.
7. Termin-/Arztfunktionen.
