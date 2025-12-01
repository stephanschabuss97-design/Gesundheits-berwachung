# MIDAS – Voice Assistant, Butler & Foodcoach

**Roadmap (Dev View, v5)**

**Ziel:**
MIDAS wird ein modularer Gesundheits-Helper, der:

* per **Voice** Panels steuert, Wasser/Protein loggt und Zustände erklärt (Butler-Modus)
* per **Text & Foto** Mahlzeiten analysiert und beim Loggen unterstützt (Foodcoach)
* später sauber als **PWA/TWA** läuft – mit stabilem Auth & Persistent Login

---

## Phase 0 – Core Foundations / Bootstrap Layer

**Ziel:**
Vom Prototyp zur stabilen App: deterministischer Boot, klarer Auth-State, kein „halb initialisiert“.
**Wichtig:** Kein Persistent Login in dieser Phase, nur die Basis.

| Task                       | Status | Beschreibung                                                                                                               |
| -------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| 0.1 Bootstrap Flow rebuild | TODO   | Neuer Bootfluss: `BOOT → AUTH_CHECK → INIT_CORE → INIT_MODULES → INIT_UI → IDLE`. UI bleibt geblockt, bis Supabase + Auth + Basis-Konfig bestätigt sind.           |
| 0.2 Cleanup Pass (Light)   | TODO   | Erste Runde: alte Logger/Workarounds raus, doppelte Listener/Guards entschärfen, dead code entfernen, `/core` minimal entschlacken. Deep Cleanup folgt in Phase 6. |
| 0.3 Auth Flow Fix          | TODO   | Pre-render Auth Gate: App rendert erst nach Supabase-Entscheid (`auth` / `unauth`). Kein klickbares UI im „auth unknown“. Klare `authState`-Übergänge.             |
| 0.4 Voice Safety Init      | TODO   | Voice/Needle bleiben deaktiviert, bis Bootflow durchlaufen + Auth klar. Keine Mic-Prompts/Audio, bevor `state=idle`.                                               |

---

## Phase 1 – Frontend Voice Controller (DONE)

**Ziel:**
Voice-State-Machine im Hub: Aufnahme → Transcribe → Assistant → TTS → Playback.

| Task                       | Status | Beschreibung                                                                                                               |
| -------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |

| 1.1 Audio Capture Skeleton | ✅    | MediaRecorder, State-Handling, Blob-Logging.
| 1.2 Transcribe Integration | ✅    | `/midas-transcribe`, `thinking`-State, Transcript-Logging.
| 1.3 Assistant Roundtrip    | ✅    | History → `/midas-assistant`; Reply + Actions werden geparst.
| 1.4 TTS Playback           | ✅    | `/midas-tts`, `<audio>`-Pipeline inkl. Interrupt/Retry.
| 1.5 Glow-Ring Animation    | ✅    | Idle/Listening/Thinking/Speaking/Error → Ring/Aura.
| 1.6 Needle Trigger Feedba. | ✅    | Button steuert Session, inkl. Press-Animation.
| 1.7 Auto-stop via VAD      | ✅    | 1 s Stille stoppt Aufnahme (Worklet in `app/modules/hub/vad`).
| 1.8 Conversation Loop End  | ✅    | Phrasen wie „nein danke“ beenden die Session sauber.

---

## Phase 2 – Backend – Supabase Edge Functions (DONE)

**Ziel:**
Stabile KI-Funktionen ohne Browser-Keys.
  
| Task                       | Status | Beschreibung                                                                                                               |
| -------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| `midas-transcribe`         | ✅    | Whisper (`gpt-4o-transcribe`), FormData Upload, CORS, Logging.                                                                                                     |
| `midas-assistant`          | ✅    | Responses API, System Prompt, Text & Voice Mode, liefert `{ reply, actions, meta }`.                                                                               |
| `midas-tts`                | ✅    | `gpt-4o-mini-tts` (Voice „cedar“), liefert Base64 oder Raw Audio.                                                                                                  |
| `midas-vision`             | ✅    | Foto-Proxy → `gpt-4.1-mini`, liefert Wasser/Salz/Protein + Empfehlung.                                                                                             |

---

## Phase 3 – Assistant UI – Textchat & Fotoanalyse

**Ziel:**
Assistant-Panel & Foto-Flow im Hub. Der Assistant kann beraten und analysieren, aber noch keine Daten schreiben.

| Task                          | Status  | Notizen                                                                                                     |
| ----------------------------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| 3.1 Assistant Text UI         | ✅       | Orbit-Button öffnet Panel `assistant-text`; Session-only History; gleicher Edge Endpoint wie Voice.         |
| 3.2 Foto-Analyse (UI)         | ✅       | Kamera/File → Base64 → `/midas-vision` → strukturierte Antwort (Salz/Protein/Wasser + Empfehlung) anzeigen. |
| 3.3 Diktiermodus (Input only) | PLANNED | Web Speech API als Eingabe-Helfer für den Textchat. Kein Teil des Voice-Loops, keine Actions.               |

> **Hinweis:**
> Kein „Suggest UI“ in Phase 3. Vorschläge, Bestätigung & Save kommen geschlossen in Phase 5 (Butler/Actions).

---

## Phase 4 – Domain Features & Utilities

**Ziel:**
MIDAS als Alltags-Tool vollständig machen, bevor der Butler & Persistent Login kommen.

### 4.1 Copy Utilities

* Intake Copy Button im UI (z. B. Capture/Doctor).
* Formate:

  * Menschlich lesbarer Text (für Arzt/Chat/Notizen).
  * Parsebarer Einzeiler, z. B.:
    `INTAKE|2025-11-28|13:05|water_ml=500|salt_g=2.1|protein_g=52`.

### 4.2 Termin- & Arztmodul

* Terminliste & Arztkartei (Nephrologe, Hausarzt, etc.).
* Voice-Queries:

  * „Wann ist mein nächster Termin?“
  * „Bring mich zum Nephrologen.“
* `DoctorRouting`: Deep Links in Maps/Telefon/Notizen, abgesichert über bestehende Unlocks/Biometrie.

---

## Phase 5 – Actions & Flows – Voice Butler / Hybrid Engine

**Ziel:**
Der Assistant wird vom Erklärer zum **Butler**.
Voice und Text/Foodcoach können kontrolliert **Daten verändern** (z. B. Intakes loggen, Module öffnen).

---

### 5.1 Intent Engine (JS Fast Path)

* `detectIntent(transcript)` in `app/modules/hub/voice-intent.js`.
* Pattern-/Regex-Matching, kein KI-Roundtrip.
* `executeIntent(intent)` ruft DOM-/Supabase-Helper.

**Beispiele (Fast Path):**

* „öffne intakes“ → `openModule("intakes")`
* „wasser 300 ml“ → `saveWater(300)`
* „protein 25 gramm“ → `saveIntake({ protein_g: 25 })`
* „schließ den chat“ → Conversation-Ende

Fallback: alles, was nicht erkannt wird, geht wie bisher über `/midas-assistant`.

---

### 5.2 Allowed Actions

Definierte, geprüfte Actions, die Voice/Text/Foodcoach auslösen dürfen:

* `IntakeSave`
* `OpenModule`
* `ReadSummary`
* `ShowIntakeStatus`
* `StartTextChatWithCamera`
* `AssistantDiagnostics`

**Nicht erlaubt:**
Chat-Persistenz, Self-Updates, Tech-Scanning, medizinische Diagnosen. Blutdruck & Körperdaten bleiben manuell im UI.

---

### 5.3 Voice-Butler Flows

1. **V1 Quick Intake**

   * „Trag 500 ml Wasser ein.“
   * Fast Path → `IntakeSave` → kurze TTS-Bestätigung.

2. **V2 Status & Empfehlung**

   * „Wie schau ich heute aus mit Salz?“
   * JS zieht Werte → KI bewertet → kurze Antwort mit Kontext.

3. **V3 UI-Steuerung**

   * „Öffne Intakes.“
   * Panel-Switch direkt, optionale Bestätigung.

4. **V4 Übergabe an Foodcoach**

   * „Ich will mein Essen analysieren.“
   * Assistant öffnet Textchat + Kamera, erklärt den Foto-Flow, dann Vision.

---

### 5.4 Text/Foodcoach – Auto-Fill Save Layer (Confirm → Save)

* Vision/Text liefern `suggestIntake`-Payload (z. B. `water_ml`, `salt_g`, `protein_g`).
* Butler entscheidet, ob dieser Vorschlag in einen konkreten Save-Call (Allowed Action `IntakeSave`) übersetzt wird.
* Flow:

  * Vorschlag generieren (UI/Voice)
  * Bestätigung einholen
  * Auf `IntakeSave` routen oder verwerfen.

---

### 5.5 Intake Suggest & Confirm UI (gemeinsame UI für Voice & Text)

**Ziel:**
Eine gemeinsame UI-Schicht für Vorschlag/Bestätigung, die **sowohl vom Voice-Flow als auch vom Text/Foodcoach-Flow** wiederverwendet wird. Deshalb MUSS dieser Punkt in dieselbe Phase wie die Allowed Actions und der Save-Mechanismus.

**Inhalt:**

* UI-Komponente, die `suggestIntake` visualisiert (z. B. kleines Card-Panel im Assistant-Bereich):

  * Wasser/Salz/Protein-Werte
  * ggf. Kontext (z. B. „geschätzte Menge für dieses Foto“)
* Standard-Dialog:

  * Frage: „Soll ich das so loggen?“
  * Buttons: **„Ja“ / „Nein“**
* „Ja“ → ruft `IntakeSave` (Allowed Action) mit der Payload auf.
* „Nein“ → verwirft die Suggestion, keine Datenänderung.
* **Wiederverwendung im Voice-Flow:**

  * Voice kann denselben Suggest-Mechanismus triggern („Das sieht nach ca. 25 g Protein aus. Soll ich das eintragen?“).
  * Bestätigung kann entweder per Voice („Ja, bitte“) oder per Tap im UI erfolgen, nutzt aber dieselbe `Suggest & Confirm`-Logik.
* **Wiederverwendung im Text-Flow:**

  * Text-/Foto-Foodcoach zeigt dieselbe UI-Komponente (z. B. unter der Analyse) und nutzt dieselben Confirm/Save-Hooks.

> **Dev-Sicht:**
> 5.5 bildet die Brücke zwischen:
>
> * Vision/Text-Suggestions
> * Voice-Suggestions
> * und dem gemeinsamen Save-Layer (`IntakeSave`).
>   Genau deshalb gehört alles, inkl. UI-Logik, in dieselbe Phase wie die Butler-Engine – nicht isoliert in Phase 3.

---

## Phase 6 – Deep Cleanup & Refactor

**Ziel:**
Wenn alle Kernfeatures stehen, Code so aufräumen, dass er langfristig wartbar bleibt.

* Logger konsolidieren (`diag`, `touch-log`, `console`).
* State-Layer weiter entschlacken (`/core/state`, Guards, Flags).
* Toter Code, verwaiste Helper, alte Experimente entfernen.
* Modul-Schnittstellen schärfen (Public/Private, Exports dokumentieren).
* Kommentare minimal, aber gezielt mit `// [anchor:...]`.

---

## Phase 7 – Session & Performance Layer (Persistent Login)

**Ziel:**
Stabile Sessions und gutes Startverhalten im Browser – Vorbereitung für PWA/TWA.

| Task                      | Status | Beschreibung                                                                                                                                                                                   |
| ------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1 Persistent Login Mode | TODO   | `persistSession: true`, Silent Refresh für Google OAuth, Session Restore beim Boot. App öffnet eingeloggt, sofern Session gültig – ohne erzwungenen Re-Login.                                  |
| 7.2 Session/Guard QA Pass | TODO   | Sicherstellen, dass `authState`, Guards und Doctor-Unlock deterministisch sind (kein „missing session“, kein Doppel-Login). Resume-/Background-Flow definieren (Tab-Wechsel, Reload, Timeout). |
| 7.3 Performance Pass      | TODO   | Nicht-kritische Module lazy laden. Charts/Vision/Doctor/Trendpilot erst nach Idle oder on-demand booten. Ziel: schneller First Paint, „fühlt sich wie native App an“.                          |

---

## Phase 8 – PWA Packaging

**Ziel:**
MIDAS als saubere Progressive Web App bereitstellen – installierbar auf Desktop/Android mit Offline-Grundfunktionalität.

### 8.1 Manifest

* `manifest.json`:

  * `name`, `short_name`, `description`
  * `start_url`, `scope`
  * `display: "standalone"`
  * `theme_color`, `background_color`
  * Icons (mind. 192x192, 512x512)

### 8.2 Service Worker – Basis

* `sw.js`:

  * Install/Activate Events
  * Caching für statische Assets (`app.css`, JS, Icons)
  * Optionale Offline-Fallback-Seite

### 8.3 Caching-Strategie

* `cache-first` für statische Ressourcen
* `network-first` für Supabase/API-Calls
* Cache-Versionierung (z. B. `midas-static-v1`)
* Bewusst: keine sensiblen API-Responses cachen

### 8.4 Installability & UX

* Lighthouse-Check (PWA-Kriterien).
* Optionaler „Installieren“-Hinweis im Hub, wenn `beforeinstallprompt` möglich.
* Tests:

  * Chrome/Edge Desktop
  * Chrome Android (Add to Home Screen)

### 8.5 PWA QA

* Online/Offline-Tests
* App-Start im Offline-Modus
* Verhalten bei Reload im Offline-Zustand
* Dokumentation in `PWA_NOTES.md` (z. B. „Ohne Internet kein KI-Assistant“).

---

## Phase 9 – TWA Packaging (Android-App-Hülle)

**Ziel:**
MIDAS als Trusted Web Activity für Android bereitstellen, auf Basis der stabilen PWA.

### 9.1 TWA-Projekt

* Bubblewrap oder Android Studio TWA-Projekt erstellen.
* Package-Name festlegen (z. B. `at.schabuss.midas`).
* App-Namen, Icons, Orientation, Theme konfigurieren.

### 9.2 Asset Links / Vertrauensanker

* `assetlinks.json` unter `/.well-known/assetlinks.json` auf deiner Domain.
* TWA so konfigurieren, dass nur deine Origin genutzt wird.

### 9.3 Android Manifest (TWA)

* TWA Activity:

  * Launch-URL = PWA-Start-URL
  * MAIN/LAUNCHER Intent
  * Orientation, Theme

### 9.4 Build & Signing

* Release-Build (AAB/APK) erstellen.
* Keystore anlegen oder bestehenden verwenden, dokumentieren.
* Versionierung (SemVer + Buildnummer) pflegen.

### 9.5 Device-Tests

* Echtes Android-Gerät:

  * Kaltstart/Warmstart
  * Back-Button-Verhalten
  * Offline-Verhalten (zusammen mit Phase 8)
  * Voice/Mic-Freigabe im TWA-Kontext

### 9.6 Play Store (optional)

* Listing (Titel, Beschreibung, Screenshots, Icon).
* Datenschutzangaben (Supabase/OpenAI/Cloud).
* Interner Test-Track (auch wenn du einziger Nutzer bist).

---

## Laufende Leitplanken

* Jede Phase = eigener Branch + Commit-Gruppe mit:

  * Kurzbeschreibung
  * CHANGELOG-Update
  * Mini-QA (Smoke Tests)
* Feature-Flags für Assistant/Voice beibehalten, um bei Bedarf schnell deaktivieren zu können.
* KI-nahe Module (`voice-intent.js`, Assistant-Panel, Edge-Functions) möglichst gekapselt halten, damit Codex-Refactors nicht in Boot/Auth/Session eingreifen.

---