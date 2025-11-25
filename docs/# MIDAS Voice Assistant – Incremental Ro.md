# MIDAS Voice Assistant – Incremental Roadmap

Ziel: Vollständiger Voice-Chat-Flow (Record → Transcribe → Assistant → TTS → Playback) mit klaren, testbaren Etappen. Jede Phase endet mit einem funktionierenden, überprüfbaren Zustand.

## 1. Client Wiring & Voice Controller (Frontend)
1. **Audio Capture Skeleton**  
   - `MediaRecorder`-Setup + Start/Stop über Voice-Button.  
   - UI-Stati (`idle`, `listening`, Fehlerfallback).  
   - Test: Klick → Aufnahme → Stop → Konsole bestätigt Blob-Größe.
2. **Transcribe Integration**  
   - Upload an `/api/midas-transcribe` inkl. Fehler-Handling.  
   - UI zeigt „thinking“, bei Fehler Rückfall zu „idle“.  
   - Test: Edge Function antwortet, Transcript im Log.
3. **Assistant Roundtrip**  
   - Transcript in Voice-Session-History speichern, Request an `/api/midas-assistant`.  
   - Antwort im Log/UI; bei Fehlern History sauber halten.  
   - Test: KI-Antwort erscheint konsistent mit Textchat.
4. **TTS Playback**  
   - Antwort → `/api/midas-tts`, Audio via `Audio`-Element abspielen.  
   - Zustände `speaking`, „Tap-to-interrupt“, Cleanup bei Stop/Fehler.  
   - Test: Audio hörbar, Stop funktioniert, keine Memory-Leaks.

## 2. Backend Edge Functions (Supabase)
1. **midas-transcribe**  
   - Whisper-Aufruf, akzeptiert `webm/opus` & `ogg`.  
   - Timeout/Size Limits, Logging.  
   - Test: Curl/HTTPie Upload liefert erwartetes Transcript.
2. **midas-assistant**  
   - Bereits vorhanden; ergänzen um `mode === 'voice'` Besonderheiten (z. B. Thermal Settings).  
   - Sicherstellen, dass History/Session-ID angenommen wird.  
   - Test: Request aus Voice-Client, Response ohne Actions.
3. **midas-tts**  
   - ElevenLabs/OpenAI TTS, Rückgabe als stream oder base64.  
   - Fehler-Codes + Fallback (Text anzeigen).  
   - Test: Text → Audio (via Postman) → MP3/WebM abspielbar.

## 3. Resilience & UX Enhancements
1. **State Machine Hardening**  
   - Race Conditions (Stop während Upload) lösen, Promises canceln.  
   - Retry-Strategien (einmalige Wiederholung bei 5xx).
2. **UI Feedback**  
   - Visuale Hinweise pro State, Toasts bei Fehlern, optional Transkript-Vorschau.  
   - Accessibility (aria-live).
3. **Metrics & Logging**  
   - Clientseitiges Timing (capture, transcribe, assistant, tts).  
   - Edge Logs strukturieren (session_id).  
4. **Regression Tests**  
   - Manual QA Matrix (Chrome, Safari, Mobile).  
   - Optional E2E-Skript (Playwright) für Smoke-Flow.

## 4. Optional Extensions
- Context sync mit Textchat (history teilen).  
- Streaming TTS (progressive playback).  
- Voice wake-word oder Keep-alive („Sag nochmal“).  
- Offline-Fallback (nur Textchat, wenn Audio blockiert).

> Empfehlung: Jede Etappe in einem eigenen Commit, inkl. README/Changelog-Eintrag und kurzem QA-Protokoll. Somit lässt sich der gesamte Voice-Assistent Feature-flag-basiert aktivieren/deaktivieren.***
